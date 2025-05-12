import config from 'config';
import express, { NextFunction } from 'express';
import mongoose from 'mongoose';
import { IAppConfig } from '../../config';
import {
  ActiveStateEnum,
  ChatGroupEnum,
  GroupNamePrefixEnum,
  HttpStatusCode,
  UserLevelEnum,
  AudienceEnum,
} from '../../enums';
import { logError, logInfo } from '../../log/util';
import {
  cacheService,
  chatService,
  enrollmentService,
  userService,
  jobBoardService,
  featureSummariesService,
} from '../../services';
import { OBUserSchemaType, HttpPutJobBoardSyncAudienceInfo } from '../../types';
import { endOfDay, mapAccessLevelToName, resolveByBatch, startOfDay } from '../../utils';
import { BaseController } from '../base_controller';

export class HealthCheckController extends BaseController {
  public basePath: string;
  public router: express.Router;

  constructor(appConfig: IAppConfig) {
    super(appConfig.envConfig);
    this.basePath = `${this.API_BASE_URL}/healthcheck`;
    this.router = express.Router();
    this.initializeRoutes();
  }

  public getBasePath(): string {
    return this.basePath;
  }

  public initializeRoutes(): void {
    this.router.get(this.basePath, this.asyncHandler(this.getHealth.bind(this)));
    this.router.get(`${this.basePath}/chat`, this.asyncHandler(this.getChatHealth.bind(this)));
    this.router.put(`${this.basePath}/sync`, this.asyncHandler(this.syncOBUsersData.bind(this)));
    this.router.get(`${this.basePath}/metrics/sync`, this.asyncHandler(this.syncMetricsData.bind(this)));
    this.router.put(
      `${this.basePath}/job-board/sync`,
      this.asyncHandler(this.syncJobShiftBoardFromSharepoint.bind(this)),
    );
  }

  private getHealth = async (request: express.Request, response: express.Response) => {
    const transactionId = request.txId;

    const { source }: { source?: string } = request.query;

    logInfo(`[${transactionId}] [CONTROLLER] [HealthCheck] Get Health status`);

    if (source) {
      logInfo(`[${transactionId}] [CONTROLLER] [HealthCheck] Source: ${source}`);
    }

    let isMongoConnected = false;
    let isRedisConnected = false;
    let isFtpConnected = false;

    try {
      // Test set and get for cache
      await cacheService.persist(transactionId, {
        serviceName: 'health_check',
        identifier: 'test-connection',
        data: {
          check: true,
        },
        expires: '1m',
      });

      const cachedData: {
        check?: boolean;
      } = await cacheService.retrieve(transactionId, {
        serviceName: 'health_check',
        identifier: 'test-connection',
      });

      if (cachedData?.check) {
        isRedisConnected = true;
      }
    } catch (redisErr) {
      logError(`[${transactionId}] [CONTROLLER] [HealthCheck] Redis Error, reason: ${redisErr.message}`);
    }

    try {
      isFtpConnected = false;
    } catch (err) {
      logError(`[${transactionId}] [CONTROLLER] [testFTPConnection] Error, reason: ${err.message}`);
    }

    if (mongoose.connection.readyState === 1) {
      isMongoConnected = true;
      logInfo(`[${transactionId}] [CONTROLLER] [HealthCheck] Mongo connected`);
    }

    response.status(HttpStatusCode.OK).send({
      status: 'ok',
      txId: request.txId,
      db: isMongoConnected,
      cache: isRedisConnected,
      ftp: isFtpConnected,
      timestamp: Date.now(),
    });
  };

  private syncOBUsersData = async (request: express.Request, response: express.Response) => {
    const transactionId = request.txId;

    try {
      const amountOfUsers: number = +request.query.amountOfUsers || 500;
      logInfo(`[${transactionId}] [CONTROLLER] [auditOBUsersData] INITIATED for ${amountOfUsers} users`);

      const options = { limit: amountOfUsers, skip: 0, sortField: 'lastSyncedAt', sortOrder: 'asc' as 'asc' | 'desc' };

      const usersToAudit = await userService.getObUsersByFilter(transactionId, {}, options);

      await enrollmentService.syncOBUserProfilesToTempData(transactionId, usersToAudit);

      logInfo(`[${transactionId}] [CONTROLLER] [auditOBUsersData] syncing of user SUCCESSFULLY completed.`);
    } catch (err) {
      logError(`[${transactionId}] [CONTROLLER] [auditOBUsersData] Error, reason: ${err.message}`);
    }
    response.status(HttpStatusCode.OK).send({
      txId: request.txId,
      timestamp: Date.now(),
    });
  };

  private getChatHealth = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    try {
      const { branchId }: { branchId?: string } = request.query;

      if (!branchId) {
        throw new Error('Please provide the branch id for chat health check!');
      }

      logInfo(
        `[${transactionId}] [CONTROLLER] [ChatHealthCheck] Get Chat Groups status initiated for branch: ${branchId}`,
      );

      const {
        missingQuickbloxUsers = [],
        validUsers: validUsersOB = [],
        activeUsers = [],
      } = await chatService.checkValidUsersInQuickBlox(transactionId, branchId);

      logInfo(`[${transactionId}] [CONTROLLER] [ChatHealthCheck] Check valid users in quickblox COMPLETED`);

      const fieldStaffs = activeUsers.filter(
        (user) => mapAccessLevelToName(user.obAccess.level) === UserLevelEnum.FIELD_STAFF,
      );

      const quickbloxExistingGroups = await chatService.listChatGroupsFromQuickblox(transactionId, {
        branchId,
        groupType: ChatGroupEnum.Broadcast,
      });

      let isBroadCastGroupsCreated = false;

      const groupNamesToCheck = Object.values(GroupNamePrefixEnum);

      const countMatchingGroups = quickbloxExistingGroups.reduce((count, group) => {
        if (groupNamesToCheck.some((prefix) => group.name.startsWith(prefix))) {
          return count + 1;
        }

        return count;
      }, 0);

      if (countMatchingGroups === groupNamesToCheck.length) {
        isBroadCastGroupsCreated = true;
      }

      logInfo(`[${transactionId}] [CONTROLLER] [ChatHealthCheck] Check existing broadcast groups COMPLETED`);

      let totalMissingIndividualGroups = 0;

      const missingIndividualGroupStats = {
        successful: new Set<string>(),
        failed: new Set<string>(),
      };

      const processFn = async (users: OBUserSchemaType[]) => {
        if (users.length === 0) {
          return;
        }

        const aggregatedQueryResult = await Promise.allSettled(
          users.map((user) =>
            chatService.getBranchChatGroups(transactionId, {
              employeePsId: user.employeePsId,
              branchIds: [branchId],
              activeStatus: ActiveStateEnum.Active,
              groupType: ChatGroupEnum.Group,
              isGroupCreator: true,
            }),
          ),
        );

        aggregatedQueryResult.forEach((chatQueryResult) => {
          if (chatQueryResult.status === 'rejected' || chatQueryResult.value.length === 0) {
            totalMissingIndividualGroups++;
          } else {
            const [individualGroup] = chatQueryResult.value;
            missingIndividualGroupStats.successful.add(individualGroup.employeePsId);
          }
        });
      };

      await resolveByBatch(fieldStaffs, 200, processFn);

      fieldStaffs.forEach(({ employeePsId }) => {
        if (!missingIndividualGroupStats.successful.has(employeePsId)) {
          missingIndividualGroupStats.failed.add(employeePsId);
        }
      });

      logInfo(`[${transactionId}] [CONTROLLER] [ChatHealthCheck] Check individual groups COMPLETED`);

      response.status(HttpStatusCode.OK).send({
        status: 'ok',
        txId: request.txId,
        totalActiveUsers: activeUsers.length,
        totalValidQuickbloxUsers: validUsersOB.length,
        missingQuickbloxUsersPsIds: missingQuickbloxUsers.map(({ customData }) => customData.psId),
        isBroadCastGroupsCreated,
        totalMissingIndividualGroups,
        missingIndividualGroupUsersPsIds: Array.from(missingIndividualGroupStats.failed),
      });
    } catch (error) {
      logError(`[${transactionId}] [CONTROLLER] [ChatHealthCheck] Error, reason: ${error.message}`);

      next(error);
    }
  };

  private syncJobShiftBoardFromSharepoint = async (
    request: express.Request,
    response: express.Response,
    next: NextFunction,
  ) => {
    const transactionId = request.txId;
    try {
      logInfo(`[${transactionId}] [CONTROLLER] [syncJobShiftBoardToSharepoint] INITIATED`);
      // const payload: HttpPutJobBoardSyncAudienceInfo = request.body;

      const jobBoardConfig: { audienceType: string; groupIds: string[]; cronEnabled: boolean } =
        config.get('Features.jobBoard');

      const payload: HttpPutJobBoardSyncAudienceInfo = {
        audienceLevel: jobBoardConfig.audienceType as AudienceEnum,
        ...(jobBoardConfig.audienceType === AudienceEnum.Division
          ? { divisionIds: jobBoardConfig.groupIds }
          : { branchIds: jobBoardConfig.groupIds }),
      };

      if (!jobBoardConfig.cronEnabled) {
        throw new Error('Cron job disabled!');
      }

      await jobBoardService.syncWithICSMasterTrackerSheet(transactionId, payload);

      logInfo(`[${transactionId}] [CONTROLLER] [syncJobShiftBoardToSharepoint] SUCCESSFUL`);

      response.status(HttpStatusCode.OK).json({
        success: true,
        message: 'Job shift board synced to Sharepoint',
      });
    } catch (syncError) {
      logError(`[${transactionId}] [CONTROLLER] [syncJobShiftBoardToSharepoint] failed`);

      next(syncError);
    }
  };

  private syncMetricsData = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;
    logInfo(`[${transactionId}] [CONTROLLER] [syncMetricsData] initiated`);

    try {
      const currentDate = new Date();
      const start = startOfDay(currentDate);
      const end = endOfDay(currentDate);
      logInfo(`[${transactionId}] [CONTROLLER] Generating metrics from ${start} to ${end}`);
      const res = await featureSummariesService.addMetricSummaryByDay(transactionId, start, end);
      response.status(HttpStatusCode.OK).json(res);
    } catch (error) {
      logError(`[${transactionId}] [CONTROLLER] [syncMetricsData] FAILED, reason: ${error.message}`);
      next(error);
    }
  };
}
