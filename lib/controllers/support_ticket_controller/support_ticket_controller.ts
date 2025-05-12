import { HttpStatusCode } from '@bayshore-healthcare/lib-error-middleware';
import { pingAuthMiddleware } from '@bayshore-healthcare/lib-ping-authentication-middleware';
import { NextFunction } from 'connect';
import express from 'express';
import { FilterQuery } from 'mongoose';
import multer from 'multer';
import { IAppConfig } from '../../config';
import { UserLevelEnum, TicketEnum, PriorityEnum, BugStatusEnum, RequestModeEnum } from '../../enums';
import { getLogger, logError, logInfo } from '../../log/util';
import { identityMiddleware, accessControlMiddlewareHOF } from '../../middlewares';
import { supportTicketService } from '../../services';
import {
  OBSupportTicketSchemaType,
  FileBufferDataType,
  HttpPOSTUpsertSupportTicket,
  SupportTicketUpsertOperationType,
} from '../../types';
import {
  isValidDate,
  mapAccessLevelToName,
  mapDBSupportTicketsToApiPayload,
  mapSupportTicketApiRequestToServiceRequest,
} from '../../utils';
import { BaseController } from '../base_controller';

const upload = multer({ storage: multer.memoryStorage() });
const logger = getLogger();

const authenticationMiddleware = pingAuthMiddleware({ logger });

export class SupportTicketController extends BaseController {
  public basePath: string;
  public router: express.Router;

  constructor(appConfig: IAppConfig) {
    super(appConfig.envConfig);
    this.basePath = `${this.API_BASE_URL}/support-tickets`;
    this.router = express.Router();
    this.router.use(this.basePath, authenticationMiddleware, identityMiddleware);
    this.initializeRoutes();
  }

  public getBasePath(): string {
    return this.basePath;
  }

  public initializeRoutes(): void {
    this.router.post(
      `${this.basePath}`,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF, UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      upload.array('files'),
      this.asyncHandler(this.createTicket),
    );

    this.router.get(
      `${this.basePath}`,
      accessControlMiddlewareHOF([
        UserLevelEnum.BRANCH_ADMIN,
        UserLevelEnum.ADMIN,
        UserLevelEnum.CONTROLLED_ADMIN,
        UserLevelEnum.SUPER_ADMIN,
      ]),
      this.asyncHandler(this.getTicketsByFilter),
    );

    this.router.get(
      `${this.basePath}/:ticketRefId`,
      accessControlMiddlewareHOF([
        UserLevelEnum.BRANCH_ADMIN,
        UserLevelEnum.ADMIN,
        UserLevelEnum.CONTROLLED_ADMIN,
        UserLevelEnum.SUPER_ADMIN,
      ]),
      this.asyncHandler(this.getTicketByRefId),
    );

    this.router.put(
      `${this.basePath}/:ticketRefId`,
      accessControlMiddlewareHOF([UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      upload.array('files'),
      this.asyncHandler(this.updateTicket),
    );
  }

  private getTicketByRefId = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    const { accessLvl } = request.obUserIdentity;

    logInfo(`[${transactionId}] [CONTROLLER] [getTicketByRefId] initiated`);
    try {
      const { ticketRefId } = request.params;

      if (!ticketRefId) {
        throw new Error('Unable to get ticket, please provide the ticketRefId!');
      }

      const accessLevelName = mapAccessLevelToName(accessLvl);

      if (accessLevelName !== UserLevelEnum.BRANCH_ADMIN) {
        throw new Error('You must be a branch admin to perform this operation.');
      }

      logInfo(`[${transactionId}] [CONTROLLER] [getTicketByRefId] retrieving ticket for ticketRefId: ${ticketRefId}`);

      const ticket = await supportTicketService.getTicketByRefId(transactionId, ticketRefId);

      if (!ticket) {
        logInfo(`[${transactionId}] [CONTROLLER] [getTicketByRefId] NO ticket found for ticketId: ${ticketRefId}`);
      }

      const mappedTicket = ticket ? mapDBSupportTicketsToApiPayload(ticket) : null;

      response.status(HttpStatusCode.OK).json(mappedTicket);
    } catch (getErr) {
      logError(`[${transactionId}] [CONTROLLER] [getTicketByRefId] failed, reason: ${getErr.message}`);

      next(getErr);
    }
  };

  private getTicketsByFilter = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    const { accessLvl } = request.obUserIdentity;

    logInfo(`[${transactionId}] [CONTROLLER] [getTicketByFilter] Get ticket initiated`);

    try {
      const accessLevelName = mapAccessLevelToName(accessLvl);

      if (
        ![
          UserLevelEnum.SUPER_ADMIN,
          UserLevelEnum.ADMIN,
          UserLevelEnum.CONTROLLED_ADMIN,
          UserLevelEnum.BRANCH_ADMIN,
        ].includes(accessLevelName)
      ) {
        throw new Error('You must be a admin to perform this operation.');
      }

      const {
        limit,
        skip,
        sortField,
        sortOrder,
        search,
        createdAtStart,
        createdAtEnd,
        initiatedUserPsId,
        initiatorType,
        ticketStatus,
        ticketType,
        priority,
        tags,
        categories,
        assignedPsIds,
        assignedBranchIds,
        title,
      }: {
        limit?: string;
        skip?: string;
        sortField?: string;
        sortOrder?: 'asc' | 'desc';
        search?: string;
        createdAtStart?: string;
        createdAtEnd?: string;
        initiatedUserPsId?: string;
        initiatorType?: RequestModeEnum;
        ticketStatus?: BugStatusEnum;
        ticketType?: TicketEnum;
        priority?: PriorityEnum;
        tags?: string[];
        categories?: string[];
        assignedPsIds?: string[];
        assignedBranchIds?: string[];
        title?: string;
      } = request.query;

      const filters: FilterQuery<OBSupportTicketSchemaType> = {};

      const actualLimit = +limit || 100;
      const skipPage = +skip || 0;

      filters.createdAt = {
        $gte: isValidDate(new Date(createdAtStart)) ? new Date(createdAtStart) : new Date(0),
        $lte: isValidDate(new Date(createdAtEnd)) ? new Date(createdAtEnd) : new Date(),
      };

      if (initiatedUserPsId) {
        filters.initiatedUserPsId = initiatedUserPsId;
      }

      if (initiatorType && initiatorType in RequestModeEnum) {
        filters.initiatorType = initiatorType;
      }

      if (ticketStatus && ticketStatus in BugStatusEnum) {
        filters.ticketStatus = ticketStatus;
      }

      if (ticketType && ticketType in TicketEnum) {
        filters.ticketType = ticketType;
      }

      if (priority && priority in PriorityEnum) {
        filters.priority = priority;
      }

      if (tags) {
        filters.tags = { $in: tags };
      }

      if (categories) {
        filters.categories = { $in: categories };
      }

      if (assignedPsIds) {
        filters.assignedPsIds = { $in: assignedPsIds };
      }

      if (assignedBranchIds) {
        filters.assignedBranchIds = { $in: assignedBranchIds };
      }

      if (title) {
        filters.title = title;
      }

      logInfo(
        `[${transactionId}] [CONTROLLER] [getTicketByFilter] Query requested for filters: ${JSON.stringify(
          filters,
        )}, skip: ${skip}, limit: ${actualLimit}`,
      );

      const tickets = await supportTicketService.getTicketsByFilter(
        transactionId,
        {
          ...filters,
        },
        {
          limit: actualLimit,
          skip: skipPage,
          sortField,
          sortOrder,
          search,
        },
      );

      const mappedTickets = tickets.map((ticket) => mapDBSupportTicketsToApiPayload(ticket));

      response.status(HttpStatusCode.OK).json(mappedTickets);
    } catch (listErr) {
      logError(`[${transactionId}] [CONTROLLER] [getTicketByFilter] FAILED, reason: ${listErr.message}`);

      next(listErr);
    }
  };

  private createTicket = async (
    request: express.Request & { files: Express.Multer.File[] },
    response: express.Response,
    next: NextFunction,
  ) => {
    const transactionId = request.txId;

    const { obUserPsId, email, displayName } = request.obUserIdentity;

    logInfo(`[${transactionId}] [CONTROLLER] [createTicket] Create tickets initiated`);

    try {
      const ticket: HttpPOSTUpsertSupportTicket = request.body;

      // TODO remove after migration
      ticket.initiatedUserPsId = ticket.initiatedUserPsId ? ticket.initiatedUserPsId : obUserPsId;
      ticket.initiatedUserEmail = ticket.initiatedUserEmail ? ticket.initiatedUserEmail : email;
      ticket.initiatedUserName = ticket.initiatedUserName ? ticket.initiatedUserName : displayName;

      const files: FileBufferDataType[] = [];
      if (Array.isArray(request.files) && request.files.length > 0) {
        if (!Array.isArray(ticket.multiMedias) || ticket.multiMedias.length < request.files.length) {
          throw new Error('Every file must have a corresponding multimedia type');
        }
        for (const multiMediaFile of request.files) {
          const file = {
            fieldName: multiMediaFile.fieldname,
            originalName: multiMediaFile.originalname,
            encoding: multiMediaFile.encoding,
            mimetype: multiMediaFile.mimetype,
            size: multiMediaFile.size,
            buffer: multiMediaFile.buffer,
          };
          files.push(file);
        }
      }

      const mappedTicket: SupportTicketUpsertOperationType = mapSupportTicketApiRequestToServiceRequest(ticket, files);

      logInfo(
        `[${transactionId}] [CONTROLLER] [createTicket] Create tickets received payload ${JSON.stringify(
          mappedTicket,
        )}`,
      );

      const createdTicketRefId = await supportTicketService.createTicket(transactionId, mappedTicket);

      logInfo(
        `[${transactionId}] [CONTROLLER] [createTicket] Create tickets completed with response ${JSON.stringify(
          createdTicketRefId,
        )}`,
      );

      if (mappedTicket?.ticketRefId) {
        await supportTicketService.sendSupportTicketEmail(transactionId, mappedTicket);
      }

      response.status(HttpStatusCode.OK).json(createdTicketRefId);
    } catch (createErr) {
      logError(`[${transactionId}] [CONTROLLER] [createTicket] Create tickets failed`);

      next(createErr);
    }
  };

  private updateTicket = async (
    request: express.Request & { files: Express.Multer.File[] },
    response: express.Response,
    next: NextFunction,
  ) => {
    const transactionId = request.txId;
    const { accessLvl } = request.obUserIdentity;
    logInfo(`[${transactionId}] [CONTROLLER] [updateTicket] initiated`);

    try {
      const accessLevelName = mapAccessLevelToName(accessLvl);

      if (![UserLevelEnum.SUPER_ADMIN, UserLevelEnum.BRANCH_ADMIN].includes(accessLevelName)) {
        throw new Error('You must be a branch admin/super admin to perform this operation.');
      }

      const partialTicketInfo: HttpPOSTUpsertSupportTicket = request.body;

      const files: FileBufferDataType[] = [];
      if (Array.isArray(request.files) && request.files.length > 0) {
        if (
          !Array.isArray(partialTicketInfo.multiMedias) ||
          partialTicketInfo.multiMedias.length < request.files.length
        ) {
          throw new Error('Every file must have a corresponding multimedia type');
        }
        for (const multiMediaFile of request.files) {
          const file = {
            fieldName: multiMediaFile.fieldname,
            originalName: multiMediaFile.originalname,
            encoding: multiMediaFile.encoding,
            mimetype: multiMediaFile.mimetype,
            size: multiMediaFile.size,
            buffer: multiMediaFile.buffer,
          };
          files.push(file);
        }
      }

      const mappedTicket: SupportTicketUpsertOperationType = mapSupportTicketApiRequestToServiceRequest(
        partialTicketInfo,
        files,
      );

      if (!mappedTicket.ticketRefId) {
        throw new Error('Unable to map ticket to a suitable format, please provide mandatory field ticketRefId!');
      }

      logInfo(
        `[${transactionId}] [CONTROLLER] [updateTicket] Update tickets received payload ${JSON.stringify(
          mappedTicket,
        )}`,
      );

      const updatedTicketId = await supportTicketService.updateTicket(transactionId, mappedTicket);

      logInfo(
        `[${transactionId}] [CONTROLLER] [updateTicket] Update tickets completed with response: ${updatedTicketId}`,
      );

      response.status(HttpStatusCode.OK).json(updatedTicketId);
    } catch (updateErr) {
      logError(`[${transactionId}] [CONTROLLER] [updateTicket] FAILED, reason: ${updateErr.message}`);

      next(updateErr);
    }
  };
}
