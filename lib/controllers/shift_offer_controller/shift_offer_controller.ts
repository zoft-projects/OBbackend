import { pingAuthMiddleware } from '@bayshore-healthcare/lib-ping-authentication-middleware';
import { NextFunction } from 'connect';
import express from 'express';
import { IAppConfig } from '../../config';
import { HttpStatusCode, ShiftOfferStatusEnum, UserLevelEnum } from '../../enums';
import { logError, logInfo, getLogger } from '../../log/util';
import { identityMiddleware, accessControlMiddlewareHOF } from '../../middlewares';
import { shiftOfferService, clientService } from '../../services';
import {
  ShiftOfferEmployeeResponseType,
  ShiftOfferConsumerType,
  VisitOccurrenceType,
  ClientFromSystemType,
} from '../../types';
import { mapShiftOfferDetailsTypeToShiftOfferDetailsPayloadType } from '../../utils';
import { BaseController } from '../base_controller';
const logger = getLogger();

const authenticationMiddleware = pingAuthMiddleware({ logger });

export class ShiftOfferController extends BaseController {
  public basePath: string;
  public router: express.Router;

  constructor(appConfig: IAppConfig) {
    super(appConfig.envConfig);
    this.basePath = `${this.API_BASE_URL}/shift-offers`;
    this.router = express.Router();
    this.router.use(this.basePath, authenticationMiddleware, identityMiddleware);
    this.initializeRoutes();
  }

  public getBasePath(): string {
    return this.basePath;
  }

  public initializeRoutes(): void {
    this.router.get(
      `${this.basePath}`,
      accessControlMiddlewareHOF([
        UserLevelEnum.FIELD_STAFF,
        UserLevelEnum.BRANCH_ADMIN,
        UserLevelEnum.ADMIN,
        UserLevelEnum.CONTROLLED_ADMIN,
        UserLevelEnum.SUPER_ADMIN,
      ]),
      this.asyncHandler(this.getShiftOffers),
    );
    this.router.get(
      `${this.basePath}/:offerId`,
      accessControlMiddlewareHOF([
        UserLevelEnum.FIELD_STAFF,
        UserLevelEnum.BRANCH_ADMIN,
        UserLevelEnum.ADMIN,
        UserLevelEnum.CONTROLLED_ADMIN,
        UserLevelEnum.SUPER_ADMIN,
      ]),
      this.asyncHandler(this.getShiftOfferById),
    );
    this.router.post(
      `${this.basePath}/:offerId/response`,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF, UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      this.asyncHandler(this.sendShiftOfferResponse),
    );
  }

  private getShiftOffers = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] getShiftOffers initiated`);

    try {
      const { obUserPsId } = request.obUserIdentity;

      const filters: {
        lastCursorId: string;
        visitOccurrenceType: string;
        status: string;
        limit: number;
        serviceRequested?: string;
      } = {
        lastCursorId: typeof request.query.lastCursorId === 'string' ? request.query.lastCursorId : '',
        visitOccurrenceType:
          typeof request.query.visitOccurrenceType === 'string'
            ? request.query.visitOccurrenceType
            : VisitOccurrenceType.singleVisit,
        status: typeof request.query.status === 'string' ? request.query.status : ShiftOfferStatusEnum.Pending,
        limit: +request.query.limit || 10,
      };

      if (request.query?.serviceRequested) {
        filters.serviceRequested = `${request.query.serviceRequested}`;
      }

      logInfo(
        `[${transactionId}] [CONTROLLER] getShiftOffers with status:${request.query.status} for obUserPsId: ${obUserPsId})}`,
      );

      const shiftOffers: ShiftOfferConsumerType[] = await shiftOfferService.getShiftOffers(
        transactionId,
        obUserPsId,
        filters,
      );

      const uniqueClientTenantIds = new Map<string, { clientId: string; tenantId: string }>();

      shiftOffers.forEach(({ clientId, tenantId }) => {
        if (clientId && tenantId) {
          uniqueClientTenantIds.set(`${clientId}_${tenantId}`, { clientId, tenantId });
        }
      });

      const aggregatedClients = new Map<string, ClientFromSystemType>();

      (uniqueClientTenantIds.size > 0
        ? await clientService.getClientDetailByClientAndTenantIds(transactionId, [...uniqueClientTenantIds.values()])
        : []
      ).forEach((client) => {
        aggregatedClients.set(`${client.clientId}_${client.tenantId}`, client);
      });

      const mappedResponse = shiftOffers.map((shiftOffer: ShiftOfferConsumerType) => {
        if (aggregatedClients.has(`${shiftOffer.clientId}_${shiftOffer.tenantId}`)) {
          return mapShiftOfferDetailsTypeToShiftOfferDetailsPayloadType(
            shiftOffer,
            aggregatedClients.get(`${shiftOffer.clientId}_${shiftOffer.tenantId}`),
          );
        }
      });

      response.status(HttpStatusCode.OK).json(mappedResponse);
    } catch (err) {
      logError(`[${transactionId}] [CONTROLLER] getShiftOffers FAILED, reason: ${err.message}`);

      next(err);
    }
  };

  private sendShiftOfferResponse = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] sendShiftOfferResponse initiated`);

    try {
      const body: ShiftOfferEmployeeResponseType = request.body;
      const { obUserPsId } = request.obUserIdentity;

      const shiftOfferId = request.params.offerId;

      logInfo(`[${transactionId}] [CONTROLLER] sendShiftOfferResponse for shiftOfferId: ${JSON.stringify(body)}`);

      const result = await shiftOfferService.sendShiftOfferResponse(transactionId, obUserPsId, shiftOfferId, body);

      response.status(HttpStatusCode.OK).send({
        success: result ? true : false,
      });
    } catch (err) {
      logError(`[${transactionId}] [CONTROLLER] sendShiftOfferResponse FAILED, reason: ${err.message}`);

      next(err);
    }
  };

  private getShiftOfferById = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] getShiftOfferById initiated`);

    try {
      const { obUserPsId } = request.obUserIdentity;

      const shiftOfferId = request.params.offerId;

      logInfo(`[${transactionId}] [CONTROLLER] getShiftOfferById for offerId: ${shiftOfferId}`);

      const shiftOffer = await shiftOfferService.getShiftOfferById(transactionId, obUserPsId, shiftOfferId);
      const clientDetails = await clientService.getClientDetailByClientAndTenantIds(transactionId, [
        { clientId: shiftOffer.clientId, tenantId: shiftOffer.tenantId },
      ]);

      const mappedResponse = mapShiftOfferDetailsTypeToShiftOfferDetailsPayloadType(shiftOffer, clientDetails[0]);

      response.status(HttpStatusCode.OK).send({
        success: !!mappedResponse,
        data: mappedResponse,
      });
    } catch (err) {
      logError(`[${transactionId}] [CONTROLLER] getShiftOfferById FAILED, reason: ${err.message}`);

      next(err);
    }
  };
}
