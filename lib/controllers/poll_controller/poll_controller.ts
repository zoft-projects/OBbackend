import { HttpStatusCode } from '@bayshore-healthcare/lib-error-middleware';
import { pingAuthMiddleware } from '@bayshore-healthcare/lib-ping-authentication-middleware';
import express, { NextFunction } from 'express';
import { FilterQuery, QueryOptions } from 'mongoose';
import { IAppConfig } from '../../config';
import { AudienceEnum, OBPollStatusEnum, PollInteractionStatusEnum, UserLevelEnum } from '../../enums';
import { getLogger, logError, logInfo } from '../../log/util';
import { identityMiddleware, accessControlMiddlewareHOF } from '../../middlewares';
import { featureSummariesService, pollService } from '../../services';
import {
  HttpPOSTCreateOBPoll,
  HttpPOSTCreateOBPollInteraction,
  OBPollInteractionSchemaType,
  OBPollsSchemaType,
  PollInteractionPayloadType,
  OBPollInteractionsSummaryType,
  PollInteractionsSummaryPayloadType,
} from '../../types';
import {
  endOfDay,
  mapDBPollInteractionsSummaryToApiPayload,
  mapDBPollInteractionsToApiPayload,
  mapDBPollToApiPayload,
  mapPollApiRequestToServiceRequest,
  startOfDay,
} from '../../utils';
import { BaseController } from '../base_controller';

const logger = getLogger();

const authenticationMiddleware = pingAuthMiddleware({ logger });

export class PollController extends BaseController {
  public basePath: string;
  public router: express.Router;

  constructor(appConfig: IAppConfig) {
    super(appConfig.envConfig);
    this.basePath = `${this.API_BASE_URL}/polls`;
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
      this.getPolls,
    );

    this.router.get(
      `${this.basePath}/:pollId`,
      accessControlMiddlewareHOF([
        UserLevelEnum.FIELD_STAFF,
        UserLevelEnum.BRANCH_ADMIN,
        UserLevelEnum.ADMIN,
        UserLevelEnum.CONTROLLED_ADMIN,
        UserLevelEnum.SUPER_ADMIN,
      ]),
      this.getPollById,
    );

    this.router.post(
      `${this.basePath}`,
      accessControlMiddlewareHOF([UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      this.createPoll,
    );
    this.router.put(
      `${this.basePath}/:pollId`,
      accessControlMiddlewareHOF([UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      this.updatePoll,
    );

    this.router.delete(
      `${this.basePath}/:pollId`,
      accessControlMiddlewareHOF([UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      this.removePoll,
    );


    this.router.post(
      `${this.basePath}/:pollId/interactions`,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF, UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      this.pollInteraction,
    );

    this.router.get(
      `${this.basePath}/:pollId/interactions/feedback`,
      accessControlMiddlewareHOF([
        UserLevelEnum.FIELD_STAFF,
        UserLevelEnum.BRANCH_ADMIN,
        UserLevelEnum.ADMIN,
        UserLevelEnum.CONTROLLED_ADMIN,
        UserLevelEnum.SUPER_ADMIN,
      ]),
      this.getFeedbackPollInteractions,
    );


    this.router.get(
      `${this.basePath}/:pollId/interactions/choices`,
      accessControlMiddlewareHOF([
        UserLevelEnum.FIELD_STAFF,
        UserLevelEnum.BRANCH_ADMIN,
        UserLevelEnum.ADMIN,
        UserLevelEnum.CONTROLLED_ADMIN,
        UserLevelEnum.SUPER_ADMIN,
      ]),
      this.getChoicePollInteractionsSummary,
    );
  }

  private pollInteraction = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] getPolls initiated`);

    try {
      const pollInteractionRequest: HttpPOSTCreateOBPollInteraction = request.body;
      let { obUserPsId, displayName } = request.obUserIdentity;

      // TODO : Remove after migration
      if (pollInteractionRequest.createdUserId) {
        obUserPsId = pollInteractionRequest.createdUserId;
      }

      // TODO : Remove after migration
      if (pollInteractionRequest.createdUserName) {
        displayName = pollInteractionRequest.createdUserName;
      }

      const poll: OBPollsSchemaType = await pollService.getPollById(transactionId, pollInteractionRequest.pollId);
      if (!poll || poll?.isDeleted) {
        throw new Error('The requested poll cannot be found or has been deleted');
      }

      const createdInteractionPoll = await pollService.pollInteraction(transactionId, {
        interactedUserPsId: obUserPsId,
        pollId: pollInteractionRequest.pollId,
        pollType: pollInteractionRequest.pollType,
        createdAt: new Date(),
        displayName,
        interactedAt: new Date(),
        feedbackComment: pollInteractionRequest.feedbackComment,
        numOfStars: pollInteractionRequest.numOfStars,
        selectionOptions: pollInteractionRequest.selectionOptions,
      });

      response.status(HttpStatusCode.OK).json({
        success: true,
        data: `Poll interaction created successful for poll id ${createdInteractionPoll}`,
      });

      // Update feature summaries for the day, update metrics table in the background for non-blocking operation
      const start = startOfDay(new Date(poll.createdAt));
      const end = endOfDay(new Date(poll.createdAt));
      logInfo(`[${transactionId}] [CONTROLLER] updatePoll updating feature summaries for the day ${start} - ${end}`);
      await featureSummariesService.addMetricSummaryByDay(transactionId, start, end);
    } catch (pollErr) {
      logError(`[${transactionId}] [CONTROLLER] getPolls FAILED, reason: ${pollErr.message}`);
      next(pollErr);
    }
  };

  private getFeedbackPollInteractions = async (
    request: express.Request,
    response: express.Response,
    next: NextFunction,
  ) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] getFeedbackPollInteractions initiated`);

    try {
      const {
        skip,
        limit,
        search,
        sortField = 'createdAt',
        sortOrder = 'desc',
      }: {
        skip?: string;
        limit?: string;
        search?: string;
        sortField?: string;
        sortOrder?: 'asc' | 'desc';
      } = request.query;

      const { pollId }: { pollId?: string } = request.params;

      if (!pollId) {
        throw new Error('Unable to get poll interactions, please provide the pollId!');
      }

      const poll: OBPollsSchemaType = await pollService.getPollById(transactionId, pollId);

      if (!poll || poll?.isDeleted) {
        throw new Error('The requested poll cannot be found or has been deleted');
      }

      const options: QueryOptions<OBPollsSchemaType> = {
        skip: +skip || 0,
        limit: +limit || 100,
        sortField,
        sortOrder,
        search,
      };

      const pollInteractions: OBPollInteractionSchemaType[] = await pollService.getPollInteractionsByPollId(
        transactionId,
        pollId,
        options,
      );

      const mappedPollInteraction: PollInteractionPayloadType[] = pollInteractions.map((pollInteraction) =>
        mapDBPollInteractionsToApiPayload(pollInteraction),
      );

      response.status(HttpStatusCode.OK).json(mappedPollInteraction);
    } catch (err) {
      logError(`[${transactionId}] [CONTROLLER] getFeedbackPollInteractions FAILED, reason: ${err.message}`);
      next(err);
    }
  };

  private getChoicePollInteractionsSummary = async (
    request: express.Request,
    response: express.Response,
    next: NextFunction,
  ) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] getChoicePollInteractionsSummary initiated`);

    try {
      const { pollId }: { pollId?: string } = request.params;

      if (!pollId) {
        throw new Error('Unable to get poll interactions, please provide the pollId!');
      }

      const poll: OBPollsSchemaType = await pollService.getPollById(transactionId, pollId);

      if (!poll || poll?.isDeleted) {
        throw new Error('The requested poll cannot be found or has been deleted');
      }

      const pollInteractionsSummary: OBPollInteractionsSummaryType = await pollService.getChoicePollInteractionsSummary(
        transactionId,
        pollId,
      );

      const mappedPollInteractionSummary: PollInteractionsSummaryPayloadType = mapDBPollInteractionsSummaryToApiPayload(
        {
          title: poll.title,
          priority: poll.priority,
          pollOptions: poll.pollOptions,
          ...pollInteractionsSummary,
        },
      );

      response.status(HttpStatusCode.OK).json(mappedPollInteractionSummary);
    } catch (err) {
      logError(`[${transactionId}] [CONTROLLER] getChoicePollInteractionsSummary FAILED, reason: ${err.message}`);
      next(err);
    }
  };

  private getPolls = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] getPolls initiated`);

    try {
      const {
        skip,
        limit,
        status = OBPollStatusEnum.Enabled,
        search,
        viewAs,
        interaction,
        audienceLevel,
        sortField = 'createdAt',
        sortOrder = 'desc',
        branchIds,
      }: {
        skip?: string;
        limit?: string;
        status?: OBPollStatusEnum;
        search?: string;
        viewAs?: string;
        audienceLevel?: AudienceEnum;
        interaction?: PollInteractionStatusEnum;
        sortField?: string;
        sortOrder?: 'asc' | 'desc';
        branchIds?: string;
      } = request.query;

      const {
        obUserPsId: userPsId,
        divisionIds: userDivisionIds,
        provinceCodes: userProvinceCodes,
      } = request.obUserIdentity;

      let userBranchIds = request.obUserIdentity.branchIds;

      if (branchIds && branchIds.split(',') && branchIds.split(',').length) {
        userBranchIds = branchIds.split(',');
      }
      const makeFilter = (): FilterQuery<OBPollsSchemaType> => {
        let filter: FilterQuery<OBPollsSchemaType> = {};

        if (AudienceEnum.Branch.toLowerCase() === audienceLevel?.toLowerCase()) {
          filter = {
            audienceLevel: AudienceEnum.Branch,
          };
          if (!userBranchIds.includes('*')) {
            filter = { ...filter, branchIds: { $in: userBranchIds } };
          }

          return filter;
        }

        if (AudienceEnum.Division.toLowerCase() === audienceLevel?.toLowerCase()) {
          filter = {
            audienceLevel: AudienceEnum.Division,
          };
          if (!userDivisionIds.includes('*')) {
            filter = { ...filter, divisionIds: { $in: userDivisionIds } };
          }

          return filter;
        }

        if (AudienceEnum.Province.toLowerCase() === audienceLevel?.toLowerCase()) {
          filter = {
            audienceLevel: AudienceEnum.Province,
          };
          if (!userProvinceCodes.includes('*')) {
            filter = { ...filter, provincialCodes: { $in: userProvinceCodes } };
          }

          return filter;
        }

        return {
          $or: [
            { audienceLevel: AudienceEnum.National },
            { $or: [{ branchIds: { $in: ['*'].concat(userBranchIds) } }] },
            { divisionIds: { $in: userDivisionIds } },
            { provincialCodes: { $in: userProvinceCodes } },
          ],
        };
      };

      const filters: FilterQuery<OBPollsSchemaType> = makeFilter();
      filters.isDeleted = false;

      if (userBranchIds.includes('*')) {
        if (filters.$or) {
          filters.$or.push({ branchIds: { $ne: [] } });
        } else {
          filters.$or = [{ branchIds: { $ne: [] } }];
        }
      }

      const actualLimit = +limit || 100;
      const skipPage = +skip || 0;

      if (status && status in OBPollStatusEnum) {
        filters.status = status;
      } else {
        filters.status = OBPollStatusEnum.Enabled;
      }

      logInfo(
        `[${transactionId}] [CONTROLLER] getPolls query requested for filters: ${JSON.stringify(
          filters,
        )}, limit: ${actualLimit}`,
      );

      const skipInteractionCheck = viewAs && viewAs.toLowerCase() === UserLevelEnum.ADMIN.toLowerCase();

      const pollData = await pollService.getPolls(
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
        {
          interaction,
          userPsId,
          branchIds: userBranchIds,
          divisionIds: userDivisionIds,
          provincialCodes: userProvinceCodes,
          skipInteractionCheck,
        },
      );

      const mappedPolls = pollData.map((poll) => mapDBPollToApiPayload(poll));

      response.status(HttpStatusCode.OK).json(mappedPolls);
    } catch (pollErr) {
      logError(`[${transactionId}] [CONTROLLER] getPolls FAILED, reason: ${pollErr.message}`);
      next(pollErr);
    }
  };

  private getPollById = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] getPollById initiated`);
    try {
      const { pollId }: { pollId?: string } = request.params;
      const { obUserPsId }: { obUserPsId?: string } = request.obUserIdentity;

      if (!pollId) {
        throw new Error('Unable to get poll, please provide the pollId!');
      }

      logInfo(`[${transactionId}] [CONTROLLER] getPollById retrieving poll for pollId: ${pollId}`);

      const poll = await pollService.getPollById(transactionId, pollId);

      if (!poll || poll?.isDeleted) {
        throw new Error('The requested poll cannot be found or has been deleted');
      }

      const pollPayload = mapDBPollToApiPayload(poll);

      logInfo(`[${transactionId}] [CONTROLLER] getPollById retrieved poll: ${JSON.stringify(pollPayload)}`);
      const pollInteraction: OBPollInteractionSchemaType = await pollService.getPollInteractionByPollIdAndUserPsID(
        transactionId,
        pollId,
        obUserPsId,
      );
      if (pollInteraction && !pollInteraction.isDeleted) {
        pollPayload.interactionStatus = PollInteractionStatusEnum.Interacted;
      } else {
        pollPayload.interactionStatus = PollInteractionStatusEnum.NonInteracted;
      }

      response.status(HttpStatusCode.OK).json(pollPayload);
    } catch (getErr) {
      logError(`[${transactionId}] [CONTROLLER] getPollById failed, reason: ${getErr.message}`);

      next(getErr);
    }
  };

  private createPoll = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] Create Poll initiated`);

    try {
      const poll: HttpPOSTCreateOBPoll = request.body;
      const { obUserPsId, displayName, accessLvl } = request.obUserIdentity;
      poll.jobLevels = [accessLvl];

      // TODO update after migration
      poll.createdByUserId = poll.createdByUserId ? poll.createdByUserId : obUserPsId;
      poll.createdByUserName = poll.createdByUserName ? poll.createdByUserName : displayName;

      const translatedPoll = mapPollApiRequestToServiceRequest(poll);

      const createdPoll = await pollService.createPoll(transactionId, translatedPoll);

      response.status(HttpStatusCode.OK).json({
        success: true,
        data: createdPoll,
      });
    } catch (err) {
      logError(`[${transactionId}] [CONTROLLER] createPoll endpoint failed with error: ${err.message}`);

      next(err);
    }
  };

  private updatePoll = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] updatePoll initiated`);

    try {
      const partialPollInfo: HttpPOSTCreateOBPoll = request.body;

      const { obUserPsId, displayName } = request.obUserIdentity;

      const translatedPoll = mapPollApiRequestToServiceRequest(partialPollInfo);

      if (!translatedPoll.pollId) {
        throw new Error('Unable to update poll, please provide the mandatory details!');
      }

      translatedPoll.updatedBy = {
        employeePsId: obUserPsId,
        displayName,
      };

      const updatedPoll = await pollService.updatePoll(transactionId, translatedPoll);

      response.status(HttpStatusCode.OK).json(updatedPoll);

      // Update feature summaries for the day, update metrics table in the background for non-blocking operation
      const start = startOfDay(new Date(updatedPoll.createdAt));
      const end = endOfDay(new Date(updatedPoll.createdAt));
      logInfo(`[${transactionId}] [CONTROLLER] updatePoll updating feature summaries for the day ${start} - ${end}`);
      await featureSummariesService.addMetricSummaryByDay(transactionId, start, end);
    } catch (updateErr) {
      logError(`[${transactionId}] [CONTROLLER] updatePoll FAILED, reason: ${updateErr.message}`);

      next(updateErr);
    }
  };

  private removePoll = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] removePoll initiated`);
    try {
      const { pollId }: { pollId?: string } = request.params;

      if (!pollId) {
        throw new Error('Unable to remove poll, please provide the mandatory details!');
      }

      logInfo(`[${transactionId}] [CONTROLLER] removePoll check poll exists for pollId: ${pollId}`);

      const pollToRemove = await pollService.getPollById(transactionId, pollId);

      if (!pollToRemove) {
        throw new Error(`Cannot remove a poll with pollId: ${pollId} because it does not exist in the system`);
      }

      logInfo(`[${transactionId}] [CONTROLLER] removePoll removing poll: ${JSON.stringify(pollToRemove)}`);

      const removedPollId = await pollService.removePoll(transactionId, pollId);

      logInfo(`[${transactionId}] [CONTROLLER] removePoll SUCCESSFUL pollId: ${removedPollId}`);

      response.status(HttpStatusCode.OK).json({
        success: true,
        message: `Poll removed successfully for ${removedPollId}`,
      });

      // Update feature summaries for the day, update metrics table in the background for non-blocking operation
      await featureSummariesService.deletePollSummary(transactionId, pollId);
      const start = startOfDay(new Date(pollToRemove.createdAt));
      const end = endOfDay(new Date(pollToRemove.createdAt));
      logInfo(`[${transactionId}] [CONTROLLER] updatePoll updating feature summaries for the day ${start} - ${end}`);
      await featureSummariesService.addMetricSummaryByDay(transactionId, start, end);
    } catch (removeErr) {
      logError(`[${transactionId}] [CONTROLLER] removePoll FAILED, reason: ${removeErr.message}`);

      next(removeErr);
    }
  };
}
