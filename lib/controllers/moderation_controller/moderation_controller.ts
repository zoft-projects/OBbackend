import { pingAuthMiddleware } from '@bayshore-healthcare/lib-ping-authentication-middleware';
import { NextFunction } from 'connect';
import express from 'express';
import { FilterQuery } from 'mongoose';
import { IAppConfig } from '../../config';
import {
  HttpStatusCode,
  ActiveStateEnum,
  TempDataValueEnum,
  UserLevelEnum,
  ReadFileTypeEnum,
  AssetEnum,
  PriorityEnum,
  NotificationPlacementEnum,
  NotificationOriginEnum,
  NotificationTypeEnum,
  AudienceEnum,
} from '../../enums';
import { logError, logInfo, getLogger } from '../../log/util';
import { identityMiddleware, accessControlMiddlewareHOF } from '../../middlewares';
import {
  userService,
  tempDataService,
  multiMediaService,
  notificationService,
  featureSummariesService,
} from '../../services';
import { OBTempDataSchemaType, TempDataUpsertOperationType } from '../../types';
import { endOfDay, mapAccessLevelToName, startOfDay } from '../../utils';
import { BaseController } from '../base_controller';

const logger = getLogger();

const authenticationMiddleware = pingAuthMiddleware({ logger });

export class ModerationController extends BaseController {
  public basePath: string;
  public router: express.Router;

  constructor(appConfig: IAppConfig) {
    super(appConfig.envConfig);
    this.basePath = `${this.API_BASE_URL}/moderations`;
    this.router = express.Router();
    this.initializeRoutes();
  }

  public getBasePath(): string {
    return this.basePath;
  }

  public initializeRoutes(): void {
    this.router.get(
      `${this.basePath}/profile-images`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([
        UserLevelEnum.FIELD_STAFF,
        UserLevelEnum.BRANCH_ADMIN,
        UserLevelEnum.ADMIN,
        UserLevelEnum.CONTROLLED_ADMIN,
        UserLevelEnum.SUPER_ADMIN,
      ]),
      this.asyncHandler(this.listImageModeration),
    );

    this.router.put(
      `${this.basePath}/profile-images`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      this.asyncHandler(this.updateImageModeration),
    );
  }

  private updateImageModeration = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    try {
      const {
        status,
        comment,
        userPsId,
      }: {
        userPsId: string;
        comment?: string;
        status: ActiveStateEnum;
      } = request.body;

      const tempDataItem = await tempDataService.getTempDatas(
        transactionId,
        userPsId,
        TempDataValueEnum.ImageModeration,
        {
          valueStatus: ActiveStateEnum.Pending,
        },
      );

      if (tempDataItem.length === 0) {
        throw new Error('No temp record available to update ');
      }

      const [tempDataRecord] = tempDataItem;

      logInfo(`[${transactionId}] [CONTROLLER] updateImageModeration - Fetch url from the s3 initiated`);

      const updateImageModerationCriteria: TempDataUpsertOperationType = {
        primaryIdentifier: userPsId,
        valueStatus: status,
        ...(comment && { comment }),
        valueType: TempDataValueEnum.ImageModeration,
      };

      await tempDataService.addTempData(transactionId, updateImageModerationCriteria, {
        shouldOverride: true,
      });

      logInfo(`[${transactionId}] [CONTROLLER] updateImageModeration - Temp data updated and image is approved`);

      if (status === ActiveStateEnum.Rejected) {
        const userDetails = await userService.getObUsersByPsId(transactionId, userPsId);

        userService.updateUserByPsId(transactionId, {
          psId: userPsId,
          tempProfile: { ...userDetails.tempProfile, imgUrl: '' },
        });

        const notification = {
          audienceLevel: AudienceEnum.Individual,
          userPsIds: [userPsId],
          notificationTitle: 'Profile Photo Rejected',
          notificationBody: `Your recently updated profile photo was rejected because "${comment}". Please review guidelines (or call branch) and resubmit. Thanks!`,
          notificationPlacements: [NotificationPlacementEnum.UserQueue],
          notificationOrigin: NotificationOriginEnum.System,
          notificationType: NotificationTypeEnum.Individual,
          notificationVisibility: AudienceEnum.Individual,
          priority: PriorityEnum.Low,
        };

        await notificationService.sendNotification(transactionId, notification);
      } else if (status === ActiveStateEnum.Approved) {
        const signedUrl = await multiMediaService.readFileFromS3(transactionId, {
          key: tempDataRecord.payload?.newProfileImage as string,
          readType: ReadFileTypeEnum.PresignedUrl,
        });

        const buffer = await multiMediaService.extractFilePropertiesFromUrl(
          transactionId,
          signedUrl as string,
          'image/',
        );

        const base64Data = buffer.buffer.toString('base64');

        logInfo(`[${transactionId}] [CONTROLLER] updateImageModeration - uploading File to employee micro service`);

        await userService.uploadFileToEmployeeService(transactionId, userPsId, {
          content: base64Data,
          fileType: tempDataRecord.payload?.contentType as string,
          type: AssetEnum.ProfileImage,
        });

        logInfo(`[${transactionId}] [CONTROLLER] updateImageModeration - uploaded File to employee micro service`);
      }

      response.status(HttpStatusCode.OK).json({
        success: true,
        message: `${status} successfully`,
      });

      // Update feature summaries for the day, update metrics table in the background for non-blocking operation
      const start = startOfDay(new Date(tempDataRecord.createdAt));
      const end = endOfDay(new Date(tempDataRecord.createdAt));
      logInfo(`[${transactionId}] [CONTROLLER] updatePoll updating feature summaries for the day ${start} - ${end}`);
      await featureSummariesService.addMetricSummaryByDay(transactionId, start, end);
    } catch (error) {
      logError(`[${transactionId}] [CONTROLLER] updateImageModerationRequest FAILED , reason: ${error.message}`);

      next(error);
    }
  };

  private listImageModeration = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;
    logInfo(`[${transactionId}] [CONTROLLER] listImageModeration initiated`);

    try {
      const {
        userPsId,
        skip,
        limit,
        status,
        search,
      }: {
        userPsId?: string;
        status?: ActiveStateEnum;
        limit?: string;
        skip?: string;
        search?: string;
      } = request.query;

      const { branchIds, accessLvl } = request.obUserIdentity;

      const currentUserAccessLevel = mapAccessLevelToName(accessLvl);

      const filters: FilterQuery<OBTempDataSchemaType> = {
        valueStatus: status,
        valueType: TempDataValueEnum.ImageModeration,
      };

      const isAdminUser = [UserLevelEnum.ADMIN, UserLevelEnum.SUPER_ADMIN].includes(currentUserAccessLevel);

      if (!isAdminUser) {
        filters['payload.branchIds'] = {
          $in: branchIds,
        };
      }

      if (userPsId) {
        filters.primaryIdentifier = userPsId;
      }

      if (search) {
        filters.$or = [
          {
            'payload.title': {
              $regex: search,
              $options: 'i',
            },
          },
          {
            'payload.userName': {
              $regex: search,
              $options: 'i',
            },
          },
        ];
      }

      logInfo(
        `[${transactionId}] [CONTROLLER] listImageModeration query requested for filters: ${JSON.stringify(
          filters,
        )}, limit: ${+limit || 10}, skip: ${+skip || 0}`,
      );

      const imageModerationUserList = await tempDataService.getTempDataByFilter(transactionId, filters, {
        limit: +limit || 10,
        skip: +skip || 0,
      });

      const results = await Promise.all(
        imageModerationUserList.map(async (moderationItem) => {
          const signedUrl = await multiMediaService.readFileFromS3(transactionId, {
            key: moderationItem.payload?.newProfileImage as string,
            readType: ReadFileTypeEnum.PresignedUrl,
          });

          return {
            ...moderationItem,
            imageUrl: signedUrl as string,
          };
        }),
      );

      response.status(HttpStatusCode.OK).json({
        success: true,
        data: results,
      });
    } catch (findErr) {
      logError(`[${transactionId}] [CONTROLLER] listImageModeration FAILED , reason: ${findErr.message}`);

      next(findErr);
    }
  };
}
