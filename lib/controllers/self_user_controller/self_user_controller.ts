import { pingAuthMiddleware } from '@bayshore-healthcare/lib-ping-authentication-middleware';
import { NextFunction } from 'connect';
import express from 'express';
import { IAppConfig } from '../../config';
import {
  HttpStatusCode,
  UserStatusEnum,
  UserLevelEnum,
  ActiveStateEnum,
  TempDataValueEnum,
  NotificationTypeEnum,
  NotificationOriginEnum,
} from '../../enums';
import { logError, logInfo, getLogger, logWarn } from '../../log/util';
import { identityMiddleware, accessControlMiddlewareHOF } from '../../middlewares';
import {
  userService,
  locationService,
  onboardUserService,
  jobService,
  notificationService,
  profileService,
  tempDataService,
  multiMediaService,
  chatV2Service,
} from '../../services';
import {
  UserInfoPayloadType,
  OBBranchDetailedOperationType,
  EmployeeConsentFilterType,
  EmployeeConsentType,
  OBAlertStatus,
  OBNotificationSchemaType,
} from '../../types';
import { mapDBUsersToApiPayload, subDays, mapDbNotificationToDbAlert, getUniqueStringsFromList } from '../../utils';
import { BaseController } from '../base_controller';

const logger = getLogger();

const authenticationMiddleware = pingAuthMiddleware({ logger });

const TEMPORARILY_PROVIDE_ACCESS_TO_INACTIVE_USERS = true;

export class SelfUserController extends BaseController {
  public basePath: string;
  public router: express.Router;

  constructor(appConfig: IAppConfig) {
    super(appConfig.envConfig);
    this.basePath = `${this.API_BASE_URL}/me`;
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
      this.getSelfUserDetails,
    );
  }

  private getSelfUserDetails = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] getSelfUserDetails initiated`);

    try {
      const { obUserPsId, branchIds, divisionIds, provinceCodes: provincialCodes } = request.obUserIdentity;
      const { pwdLastSet } = request.employeePingIdentity;

      const interactedNotificationIds: string[] = [];
      const [
        obUserInfo,
        employeeInfo,
        prerequisites,
        topNotifications = [],
        tempProfileChanges = [],
        { activeGroups: chatV2Groups },
      ] = await Promise.all([
        userService.getObUsersByPsId(transactionId, obUserPsId),
        userService.getEmployeePSFromEmployeeService(transactionId, obUserPsId),
        // TODO: Needs performance improvement, add filter
        onboardUserService.getAllPrerequisites(transactionId),
        notificationService.getNotifications(
          transactionId,
          {
            branchIds,
            divisionIds,
            provincialCodes,
            notificationOrigin: NotificationOriginEnum.Alert,
            notificationType: NotificationTypeEnum.Group,
            isDeleted: false,
            status: OBAlertStatus.Active,
          },
          {
            skip: 0,
            limit: 50,
            sortField: 'createdAt',
            sortOrder: 'desc',
          },
        ),
        tempDataService.getTempDatas(transactionId, obUserPsId, TempDataValueEnum.ImageModeration, {
          valueStatus: ActiveStateEnum.Pending,
        }),
        chatV2Service.getAllChatGroupsByUser(transactionId, obUserPsId),
      ]);

      const prereqAttempts = await Promise.all(
        (obUserInfo.prerequisites ?? []).map(({ preReqId }) =>
          onboardUserService.getSkippedAttemptByPrereqAndPsId(transactionId, preReqId, obUserPsId),
        ),
      );

      const mappedNotifications = topNotifications.map((notification) => mapDbNotificationToDbAlert(notification));

      if (obUserInfo.activeStatus !== UserStatusEnum.Active) {
        if (!TEMPORARILY_PROVIDE_ACCESS_TO_INACTIVE_USERS) {
          throw new Error(
            'Sorry, we are unable to find an active account under your name. Please contact your branch if you believe this is an error!',
          );
        }

        logWarn(
          `[${transactionId}] [CONTROLLER] getSelfUserDetails found ${obUserInfo.activeStatus} user but bypassing to provide access on temporary basis`,
        );
      }

      const [latestProfileChangeRequest] = tempProfileChanges;

      if (latestProfileChangeRequest) {
        const { newProfileImage: pendingProfileImageUrl }: { newProfileImage?: string } =
          latestProfileChangeRequest.payload ?? {};

        if (pendingProfileImageUrl) {
          const signedUrl = await multiMediaService.makeSignedUrl(transactionId, pendingProfileImageUrl);

          obUserInfo.tempProfile = {
            ...(obUserInfo.tempProfile ?? {}),
            tempProfileImgUrl: signedUrl,
          };
        }
      }

      let branchList: OBBranchDetailedOperationType[] = [];

      if (obUserInfo.branchAccess.canAccessAll) {
        branchList = await locationService.getAllBranchesWithDivisions(transactionId);
      } else {
        const userBranchIds = getUniqueStringsFromList(
          obUserInfo.branchAccess.selectedBranchIds,
          obUserInfo.branchAccess.overriddenBranchIds,
        );
        branchList = await Promise.all(
          userBranchIds.map((branchId) => locationService.getBranchDetailsById(transactionId, branchId)),
        );
      }

      let currentJob = await jobService.getJobById(transactionId, obUserInfo.job.jobId);

      if (obUserInfo.obAccess?.jobId) {
        currentJob = await jobService.getJobById(transactionId, obUserInfo.obAccess.jobId);
        if (obUserInfo.obAccess?.jobId && obUserInfo.obAccess?.jobId !== obUserInfo.job.jobId) {
          // update the user's job title and code from the overridden job.
          obUserInfo.job.title = currentJob.jobTitle;
          obUserInfo.job.code = currentJob.jobCode;
        }
        obUserInfo.job.jobId = currentJob.jobId;
        obUserInfo.job.level = currentJob.jobLevel;
      }

      const notifications: OBNotificationSchemaType[] = [];

      const allAlerts = [...obUserInfo.topAlerts, ...mappedNotifications];
      const uniqueAlertIds = [...new Set(allAlerts.map((alert) => alert.alertId))];
      if (uniqueAlertIds?.length > 0) {
        const [availableNotifications, interactedNotifications] = await Promise.all([
          notificationService.getUserNotificationsByFilter(
            transactionId,
            {
              notificationId: { $in: uniqueAlertIds },
              // Notifications created in the last 60 days which are unexpired or no expiration based on fetch time
              $or: [
                { expiresAt: { $exists: false } },
                { expiresAt: { $eq: null } },
                { expiresAt: { $gte: new Date() } },
              ],
              createdAt: { $gte: subDays(Date.now(), 60) },
            },
            { skip: 0, limit: 50 },
          ),
          notificationService.getInteractedNotificationsByIds(transactionId, uniqueAlertIds, obUserPsId),
        ]);

        availableNotifications.forEach((notification) => {
          notifications.push(notification);
        });

        interactedNotifications.forEach((notificationInteraction) => {
          interactedNotificationIds.push(notificationInteraction.notificationId);
        });
      }

      const passwordValidity = userService.calculatePasswordExpirationDays(transactionId, obUserPsId, pwdLastSet);

      const filters: EmployeeConsentFilterType = {
        limit: request.query.limit ? parseInt(request.query?.limit?.toString()) : 10,
        employeePsId: obUserPsId,
      };

      if (request.query.type) {
        filters.type = request.query.type.toString();
      }

      if (request.query.lastCursorId) {
        filters.lastCursorId = request.query.lastCursorId.toString();
      }

      let consents: EmployeeConsentType[] = [];

      if (request.query.detailed) {
        consents = await profileService.getEmployeeConsents(transactionId, filters);
      }

      const userPayload: UserInfoPayloadType = mapDBUsersToApiPayload(obUserInfo, {
        vendors: {
          employeeInfo,
          employeeInfoFromToken: request.employeePingIdentity,
          passwordExpiresInDays: passwordValidity.passwordExpiresInDays,
          isPasswordExpiringSoon: passwordValidity.isPasswordExpiringSoon,
        },
        dependencies: {
          prerequisites,
          branches: branchList,
          job: currentJob,
          shouldOverrideJobLevel: true,
          shouldOverrideBusiness: true,
          notifications,
          consents,
          interactedNotificationIds,
          prereqAttempts,
          chatV2Groups,
        },
      });

      logInfo(`[${transactionId}] [CONTROLLER] getSelfUserDetails SUCCESSFUL`);

      response.status(HttpStatusCode.OK).json(userPayload);
    } catch (err) {
      logError(`[${transactionId}] [CONTROLLER] getSelfUserDetails FAILED with error: ${err.message}`);

      next(err);
    }
  };
}
