import { pingAuthMiddleware } from '@bayshore-healthcare/lib-ping-authentication-middleware';
import config from 'config';
import { NextFunction } from 'connect';
import express from 'express';
import multer from 'multer';
import { IAppConfig } from '../../config';
import {
  ActiveStateEnum,
  HttpStatusCode,
  MultiMediaEnum,
  PrerequisiteStepEnum,
  S3FoldersEnum,
  TempDataValueEnum,
  UserLevelEnum,
} from '../../enums';
import { logError, logInfo, getLogger } from '../../log/util';
import { identityMiddleware, accessControlMiddlewareHOF } from '../../middlewares';
import { multiMediaService, tempDataService, onboardUserService, jobService } from '../../services/';
import * as userService from '../../services/user_service/user_service';
import {
  HTTPPostRecoverySSPRType,
  HTTPPostCreatePrerequisiteType,
  HttpPOSTCreateOBPrerequisiteAcceptance,
  OBPrerequisiteAcceptanceOperationType,
  OBUserPrerequisiteUpsertOperationType,
  MultiMediaBufferType,
  EmployeeInPsUpsertOperationType,
  OBProfileUpsertOperationType,
} from '../../types';
import {
  mapPrerequisiteAcceptanceRequestToDBRecord,
  mapPrerequisiteRequestToOperation,
  mapPrerequisiteApiRequestToOperation,
  userPsId,
  mapDBUsersToIdentityCardApiPayload,
  getEffectiveJobRole,
} from '../../utils';
import { BaseController } from '../base_controller';

const bucketNameS3: string = config.get('Services.s3.bucketName');
const logger = getLogger();
const upload = multer({ storage: multer.memoryStorage() });

const authenticationMiddleware = pingAuthMiddleware({ logger });

export class OnboardUserController extends BaseController {
  public basePath: string;
  public router: express.Router;

  constructor(appConfig: IAppConfig) {
    super(appConfig.envConfig);
    this.basePath = `${this.API_BASE_URL}/onboard`;

    this.router = express.Router();
    this.router.use(this.basePath, authenticationMiddleware, identityMiddleware);

    this.initializeRoutes();
  }

  public getBasePath(): string {
    return this.basePath;
  }

  public initializeRoutes(): void {
    // Manage prerequisites
    this.router.post(
      `${this.basePath}/prerequisite`,
      accessControlMiddlewareHOF([UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      this.asyncHandler(this.createPrerequisite.bind(this)),
    );
    this.router.delete(
      `${this.basePath}/prerequisite/:prerequisiteId`,
      accessControlMiddlewareHOF([UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      this.asyncHandler(this.removePrerequisite.bind(this)),
    );

    // When user interacts with the prerequisites
    this.router.post(
      `${this.basePath}/step-interacted`,
      accessControlMiddlewareHOF([
        UserLevelEnum.FIELD_STAFF,
        UserLevelEnum.BRANCH_ADMIN,
        UserLevelEnum.ADMIN,
        UserLevelEnum.CONTROLLED_ADMIN,
        UserLevelEnum.SUPER_ADMIN,
      ]),
      this.asyncHandler(this.stepInteracted.bind(this)),
    );

    // When user wants to manage the recovery details
    this.router.post(
      `${this.basePath}/recovery`,
      accessControlMiddlewareHOF([
        UserLevelEnum.FIELD_STAFF,
        UserLevelEnum.BRANCH_ADMIN,
        UserLevelEnum.ADMIN,
        UserLevelEnum.CONTROLLED_ADMIN,
        UserLevelEnum.SUPER_ADMIN,
      ]),
      this.asyncHandler(this.setupRecovery.bind(this)),
    );

    this.router.post(
      `${this.basePath}/badge`,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF, UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      upload.single('file'),
      this.asyncHandler(this.uploadBadge.bind(this)),
    );

    // get the identity card details
    this.router.get(
      `${this.basePath}/identity`,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF, UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      this.asyncHandler(this.getIdentityCardDetailsById.bind(this)),
    );
  }

  private uploadBadge = async (
    request: express.Request & { file: Express.Multer.File },
    response: express.Response,
    next: NextFunction,
  ) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] uploadBadge initiated`);

    try {
      const { obUserPsId } = request.obUserIdentity;

      let file: MultiMediaBufferType = null;

      if (!request?.file?.buffer) {
        throw new Error('File is missing');
      }

      if (request.file) {
        file = {
          fieldName: request.file.fieldname,
          originalName: request.file.originalname,
          encoding: request.file.encoding,
          mimetype: request.file.mimetype,
          size: request.file.size,
          buffer: request.file.buffer,
        };
      }

      const s3StoredData: { fileName: string } = await multiMediaService.storeIntoS3FromBuffer(
        transactionId,
        file,
        bucketNameS3,
        MultiMediaEnum.Image,
        S3FoldersEnum.Badge,
      );

      logInfo(
        `[${transactionId}] [CONTROLLER] [uploadBadge] File uploaded to s3 SUCCESSFULLY for, psId: ${obUserPsId}`,
      );

      const updateUserInfo: Partial<OBProfileUpsertOperationType & EmployeeInPsUpsertOperationType> = {
        psId: obUserPsId,
        badge: {
          badgeImageUrl: s3StoredData.fileName,
          bucketName: bucketNameS3,
        },
      };

      await userService.updateUserByPsId(transactionId, updateUserInfo);

      logInfo(`[${transactionId}] [CONTROLLER] [uploadBadge] Badge set SUCCESSFULLY, psId: ${obUserPsId}`);

      response.status(HttpStatusCode.OK).json({
        success: true,
        message: `Badge set successfully for ${obUserPsId}`,
      });
    } catch (err) {
      logError(`[${transactionId}] [CONTROLLER] uploadBadge endpoint failed with error: ${err.message}`);
      next(err);
    }
  };

  private removePrerequisite = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;
    const { prerequisiteId } = request.params;

    logInfo(`[${transactionId}] [CONTROLLER] [removePrerequisite] Removing prerequisite`);

    try {
      // TODO remove prerequisites for the all the users as well
      const removedId = await onboardUserService.removePrerequisiteById(transactionId, prerequisiteId);

      response.status(HttpStatusCode.OK).json({
        success: true,
        message: `Prerequisite ${removedId} removed successfully!`,
      });
    } catch (removeErr) {
      logError(
        `[${transactionId}] [CONTROLLER] [removePrerequisite] FAILED for ${prerequisiteId}, reason: ${removeErr.message}`,
      );

      next(removeErr);
    }
  };

  private createPrerequisite = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;
    logInfo(`[${transactionId}] [CONTROLLER] [createPrerequisite] Creating prerequisite for onboarding step initiated`);

    try {
      const prerequisite = request.body as HTTPPostCreatePrerequisiteType;

      const createdPrereqId = await onboardUserService.createPrerequisite(
        transactionId,
        mapPrerequisiteApiRequestToOperation(prerequisite),
      );

      logInfo(
        `[${transactionId}] [CONTROLLER] [createPrerequisite] Created prerequisite SUCCESSFULLY, prereqId: ${createdPrereqId} for audience: ${prerequisite.audienceLevel}`,
      );

      response.status(HttpStatusCode.OK).json({
        success: true,
        message: `Created prerequisite ${createdPrereqId} successfully`,
      });
    } catch (createErr) {
      logError(
        `[${transactionId}] [CONTROLLER] [createPrerequisite] Creating prerequisite Onboarding step error, reason: ${createErr.message}`,
      );

      next(createErr);
    }
  };

  private stepInteracted = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] [stepInteracted] onboarding step initiated`);

    try {
      const payload: HttpPOSTCreateOBPrerequisiteAcceptance = request.body;

      const { obUserPsId } = request.obUserIdentity;

      if (!payload.type || !payload.response) {
        // TODO Frontend is expecting a json response
        response.status(HttpStatusCode.OK).json({ success: true, message: 'Thanks, we will remind you later.' });

        logInfo(`[${transactionId}] [CONTROLLER] [stepInteracted] Missing params and ignoring`);

        return;
      }

      if (payload.response.toLowerCase() === 'skipped') {
        // TODO Frontend is expecting a json response
        response.status(HttpStatusCode.OK).json({ success: true, message: 'Thanks, we will remind you later.' });

        logInfo(
          `[${transactionId}] [CONTROLLER] [stepInteracted] onboarding step skipped psId: ${obUserPsId}, prereqId: ${payload.prerequisiteId}`,
        );

        await onboardUserService.incrementPrereqAttempts(transactionId, payload.prerequisiteId, obUserPsId);

        return;
      }

      if (payload.type.toUpperCase() === PrerequisiteStepEnum.Intermittent.toUpperCase()) {
        const translatedPrerequisiteAcceptance: OBPrerequisiteAcceptanceOperationType =
          mapPrerequisiteAcceptanceRequestToDBRecord({
            ...payload,
            type: PrerequisiteStepEnum.Intermittent,
            employeePsId: obUserPsId,
          });

        logInfo(
          `[${transactionId}] [CONTROLLER] [stepInteracted] onboarding step add the psId: ${obUserPsId}, response to prerequisiteId: ${payload.prerequisiteId}`,
        );

        await onboardUserService.createPrerequisiteAcceptance(transactionId, translatedPrerequisiteAcceptance);
      }

      if (payload.type.toUpperCase() === PrerequisiteStepEnum.Sspr.toUpperCase()) {
        const translatedPrerequisite: OBUserPrerequisiteUpsertOperationType = mapPrerequisiteRequestToOperation({
          ...payload,
          type: PrerequisiteStepEnum.Sspr,
          employeePsId: obUserPsId,
        });

        logInfo(`[${transactionId}] [CONTROLLER] [stepInteracted] onboarding step user confirms SSPR details`);

        await onboardUserService.updateSSPRPrerequisites(transactionId, translatedPrerequisite);
      }

      logInfo(`[${transactionId}] [CONTROLLER] [stepInteracted] onboarding step SUCCESSFUL`);

      response.status(HttpStatusCode.OK).json({ success: true, message: 'Thank you for the submission.' });
    } catch (updateErr) {
      logError(`[${transactionId}] [CONTROLLER] [stepInteracted] Onboarding step error, reason: ${updateErr.message}`);

      next(updateErr);
    }
  };

  private setupRecovery = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] [setupRecovery] onboarding recovery setup initiated`);

    try {
      const { employeePsId, Username: userEmail } = request.employeePingIdentity;
      const { recoveryEmail, recoveryPhone }: HTTPPostRecoverySSPRType = request.body;

      if (!employeePsId) {
        throw new Error('Required employeePsId is missing for updating the recovery details');
      }

      const updatedRecovery: {
        recoveryEmail?: string;
        recoveryPhone?: string;
        imgUrl?: string;
        tempStatus?: string;
      } = {};

      if (recoveryEmail) {
        updatedRecovery.recoveryEmail = recoveryEmail;
        updatedRecovery.tempStatus = ActiveStateEnum.Active;
      }

      if (recoveryPhone) {
        updatedRecovery.recoveryPhone = recoveryPhone;
        updatedRecovery.tempStatus = ActiveStateEnum.Active;
      }

      const updatedStatus = await userService.createOrUpdateMultipleObUsers(transactionId, [
        {
          psId: userPsId(employeePsId, userEmail),
          tempProfile: {
            ...updatedRecovery,
          },
        },
      ]);

      const isUpdated = updatedStatus.successfulPsIds.includes(userPsId(employeePsId, userEmail));

      if (isUpdated) {
        const translatedPrerequisite: OBUserPrerequisiteUpsertOperationType = mapPrerequisiteRequestToOperation({
          employeePsId: userPsId(employeePsId, userEmail),
          type: PrerequisiteStepEnum.Sspr,
          prerequisiteId: PrerequisiteStepEnum.Sspr,
        });

        await onboardUserService.updateSSPRPrerequisites(transactionId, translatedPrerequisite);
      }

      response.status(HttpStatusCode.OK).send({
        success: isUpdated,
        message: isUpdated ? 'Recovery details are recorded successfully.' : 'No changes made to the profile',
      });
    } catch (updateErr) {
      logError(`[${transactionId}] [CONTROLLER] [setupRecovery] Onboarding step error, reason: ${updateErr.message}`);

      next(updateErr);
    }
  };

  private getIdentityCardDetailsById = async (
    request: express.Request,
    response: express.Response,
    next: NextFunction,
  ) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] getIdentityCardDetailsById initiated`);

    try {
      const { obUserPsId } = request.obUserIdentity;

      logInfo(
        `[${transactionId}] [CONTROLLER] getIdentityCardDetailsById retrieving employee for employeePsId: ${obUserPsId}`,
      );

      const [userIdentity, employeeInfo, tempProfileChanges = []] = await Promise.all([
        onboardUserService.getIdentityDetailsForPsId(transactionId, obUserPsId),
        userService.getEmployeePSFromEmployeeService(transactionId, obUserPsId),
        tempDataService.getTempDatas(transactionId, obUserPsId, TempDataValueEnum.ImageModeration),
      ]);

      const [userDetails, branchDetails] = userIdentity;

      const [latestProfileChangeRequest] = tempProfileChanges;

      if (latestProfileChangeRequest) {
        const { newProfileImage: pendingProfileImageUrl }: { newProfileImage?: string } =
          latestProfileChangeRequest.payload ?? {};

        if (pendingProfileImageUrl) {
          const signedUrl = await multiMediaService.makeSignedUrl(transactionId, pendingProfileImageUrl);

          userDetails.tempProfile = {
            ...(userDetails.tempProfile ?? {}),
            tempProfileImgUrl: signedUrl,
          };
        }
      }

      const employeeDetailsList = await userService.getObUsersByFilter(transactionId, {
        employeePsId: { $in: branchDetails.branchManagerPsIds },
      });

      // Fetching job categories for the users to differentiate clinical and non-clinical users
      const jobId = getEffectiveJobRole(userDetails.obAccess, userDetails.job).jobId;

      // TODO: Rather than calling the job service directly, we should incorporate job categories into the middleware
      const jobDetails = await jobService.getJobById(transactionId, jobId);

      const mappedPayload = mapDBUsersToIdentityCardApiPayload(
        userDetails,
        employeeInfo,
        branchDetails,
        employeeDetailsList,
        jobDetails,
      );

      logInfo(
        `[${transactionId}] [CONTROLLER] getIdentityCardDetailsById retrieved obUserPsId: ${JSON.stringify(
          mappedPayload,
        )}`,
      );

      response.status(HttpStatusCode.OK).json(mappedPayload);
    } catch (getErr) {
      logError(`[${transactionId}] [CONTROLLER] getIdentityCardDetailsById failed, reason: ${getErr.message}`);

      next(getErr);
    }
  };
}
