import config from 'config';
import { NextFunction } from 'connect';
import express from 'express';
import { IAppConfig } from '../../config';
import {
  ActiveEnum,
  ActiveStateEnum,
  BranchFeaturesProvisionEnum,
  FeatureEnum,
  HttpStatusCode,
  UserLevelEnum,
} from '../../enums';
import { logError, logInfo } from '../../log/util';
import { onebayshoreInternalApiMiddleware } from '../../middlewares';
import {
  userService,
  enrollmentService,
  chatService,
  featureProvisioningService,
  mailService,
  locationService,
  jobService,
  chatV2Service,
} from '../../services';
import { MailUserConsumerType, HTTPPostEnrollmentApiInput } from '../../types';
import {
  getEffectiveBranchIds,
  mapAccessNameToBaseLevel,
  mapApiRequestToOperation,
  mapPSRecordToEmployeeOperation,
  userPsId,
} from '../../utils';
import { BaseController } from '../base_controller';

const mailboxFeatureConfig: { supportEnabled: boolean; mailDomainForFieldStaff: string } =
  config.get('Features.mailbox');

export class EnrollUserController extends BaseController {
  public basePath: string;
  public router: express.Router;

  constructor(appConfig: IAppConfig) {
    super(appConfig.envConfig);
    this.basePath = `${this.API_BASE_URL}/enroll`;
    this.router = express.Router();
    this.router.use(this.basePath, onebayshoreInternalApiMiddleware);
    this.initializeRoutes();
  }

  public getBasePath(): string {
    return this.basePath;
  }

  public initializeRoutes(): void {
    this.router.post(this.basePath, this.asyncHandler(this.enrollUserInSystem.bind(this)));
  }

  private enrollUserInSystem = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] [enrollUserInSystem] Auto enrollment initiated`);

    const enrollmentUserPayload = request.body as HTTPPostEnrollmentApiInput;
    const userIdentifier = userPsId(enrollmentUserPayload.employee_id);

    try {
      logInfo(
        `[${transactionId}] [CONTROLLER] [enrollUserInSystem] Received payload for ${userIdentifier}, details: ${JSON.stringify(
          enrollmentUserPayload || null,
        )}`,
      );

      await enrollmentService.backupEnrollmentData(transactionId, {
        userPsId: userIdentifier,
        enrollmentData: enrollmentUserPayload,
      });

      logInfo(`[${transactionId}] [CONTROLLER] [enrollUserInSystem] backup taken for ${userIdentifier}`);

      const translatedUserPayload = mapApiRequestToOperation(enrollmentUserPayload);

      enrollmentService.validateUserEnrollmentProfile(translatedUserPayload);

      const mappedEmployeeServiceData = mapPSRecordToEmployeeOperation(translatedUserPayload);

      try {
        const previousUserRecord = await userService.getEmployeePSFromEmployeeService(transactionId, userIdentifier);

        // Create or update employee in employee microservice
        if (previousUserRecord) {
          await userService.updateEmployeeInEmployeeService(transactionId, userIdentifier, mappedEmployeeServiceData);
        } else {
          await userService.createMultipleUsersInEmployeeService(transactionId, [mappedEmployeeServiceData]);
        }

        logInfo(
          `[${transactionId}] [CONTROLLER] [enrollUserInSystem] sync to EmployeeService ${userIdentifier} SUCCESSFUL`,
        );

        const { branchId } = await locationService.getBranchDetailsByLocationId(
          transactionId,
          translatedUserPayload.locationId,
          {
            locationId: translatedUserPayload.locationId,
            locationCity: translatedUserPayload.locationId,
            locationProvince: translatedUserPayload.locationId,
            locationDescription: translatedUserPayload.locationId,
          },
        );

        const { jobLevel = mapAccessNameToBaseLevel(UserLevelEnum.FIELD_STAFF) } = await jobService.getJobById(
          transactionId,
          translatedUserPayload.jobCode,
        );

        logInfo(
          `[${transactionId}] [CONTROLLER] [enrollUserInSystem] Checking email feature is enabled for branchId: ${branchId}, jobLevel: ${jobLevel}, supportEnabled: ${mailboxFeatureConfig.supportEnabled}`,
        );

        if (mailboxFeatureConfig.supportEnabled && branchId && jobLevel) {
          const isProvisioned = await featureProvisioningService.getProvisionForBranchId(
            transactionId,
            BranchFeaturesProvisionEnum.EmailFeature,
            branchId,
            jobLevel,
          );
          logInfo(`[${transactionId}] [CONTROLLER] [enrollUserInSystem] Email feature status: ${isProvisioned}`);

          const obUser = await userService.getObUsersByPsId(transactionId, userIdentifier);

          const [userId] = mappedEmployeeServiceData.email.split('@');
          const payload: MailUserConsumerType = {
            employeeId: mappedEmployeeServiceData.employeePsId,
            firstName: mappedEmployeeServiceData.firstName,
            lastName: mappedEmployeeServiceData.lastName,
            emailAddress: `${userId}@${mailboxFeatureConfig.mailDomainForFieldStaff}`,
            bayshoreEmailAddress: `${userId}@${mailboxFeatureConfig.mailDomainForFieldStaff}`,
            bayshoreUserId: userId,
            isActive: mappedEmployeeServiceData.workStatus === ActiveStateEnum.Active,
            dateCreated: new Date(),
            status: mappedEmployeeServiceData.workStatus,
            previousUserRecord: previousUserRecord ? true : false,
          };

          logInfo(
            `[${transactionId}] [CONTROLLER] [enrollUserInSystem] OB-User Exists: ${obUser}, Payload: ${payload}`,
          );

          if (isProvisioned) {
            logInfo(
              `[${transactionId}] [CONTROLLER] [enrollUserInSystem] Email feature is enabled for branchId: ${branchId}, jobLevel: ${jobLevel}`,
            );

            await mailService.sendMailUsersDataToEmployeeService(transactionId, [payload]);

            logInfo(
              `[${transactionId}] [CONTROLLER] [enrollUserInSystem] Send email data to EmployeeService ${userIdentifier} SUCCESSFUL`,
            );

            // If user exists in onebayshore, update the preferences
            if (obUser) {
              obUser.preferences = obUser.preferences || [];
              if (obUser.preferences && Array.isArray(obUser.preferences)) {
                // Update the type to match the enum
                translatedUserPayload.preferences = obUser.preferences.map((pref) => ({
                  prefName: pref.name as FeatureEnum,
                  prefValue: pref.value as ActiveEnum,
                }));
                // Check if the user has the email inbox preference
                const mailAccessPref = translatedUserPayload.preferences.find(
                  (pref) => pref.prefName === FeatureEnum.EmailInbox,
                );
                // If the user has the email inbox preference, update the value
                if (mailAccessPref) {
                  mailAccessPref.prefValue = ActiveEnum.Enabled;
                } else {
                  // If the user does not have the email inbox preference, add it
                  translatedUserPayload.preferences.push({
                    prefName: FeatureEnum.EmailInbox,
                    prefValue: ActiveEnum.Enabled,
                  });
                }
              }
            }
          }
        }
      } catch (writeErr) {
        logError(
          `[${transactionId}] [CONTROLLER] [enrollUserInSystem] sync to EmployeeService ${userIdentifier} FAILED`,
        );
      }

      // Create user in onebayshore
      const enrolledPsId = await enrollmentService.enrollUserInOB(transactionId, translatedUserPayload);

      logInfo(`[${transactionId}] [CONTROLLER] [enrollUserInSystem] Auto enrollment SUCCESSFUL for ${enrolledPsId}`);

      response.status(HttpStatusCode.OK).send({
        success: true,
        message: 'Profile successfully received',
        details: {
          psId: enrolledPsId,
        },
      });

      const enrolledUser = await userService.getObUsersByPsId(transactionId, enrolledPsId);

      if (!enrolledUser) {
        logError(
          `[${transactionId}] [CONTROLLER] [enrollUserInSystem] enrolled user not found, enrolledPsId ${enrolledPsId}`,
        );

        return;
      }

      const currentBranchIds = getEffectiveBranchIds(
        enrolledUser.branchAccess.overriddenBranchIds,
        enrolledUser.branchAccess.selectedBranchIds,
      );

      await Promise.allSettled(
        currentBranchIds.map((branchId) => chatV2Service.syncChatUserAccessForBranch(transactionId, branchId)),
      ).catch((err) => {
        logError(
          `[${transactionId}] [CONTROLLER] [enrollUserInSystem] Chat v2 sync issue ERROR, reason: ${err.message}`,
        );
      });

      await Promise.allSettled(
        currentBranchIds.map((branchId) => chatV2Service.syncBranchChatAbility(transactionId, enrolledPsId, branchId)),
      );

      /**
       * @deprecated
       * TODO: Remove after new Chat vendor enablement
       */
      await Promise.allSettled(
        currentBranchIds.map((branchId) => chatService.syncChatGroupForBranch(transactionId, branchId)),
      );
    } catch (enrollErr) {
      logError(
        `[${transactionId}] [CONTROLLER] [enrollUserInSystem] Auto enrollment FAILED for ${userIdentifier}, reason: ${enrollErr.message}`,
      );

      next(enrollErr);
    }
  };
}
