import { HttpStatusCode } from '@bayshore-healthcare/lib-error-middleware';
import { pingAuthMiddleware } from '@bayshore-healthcare/lib-ping-authentication-middleware';
import express, { NextFunction } from 'express';
import { FilterQuery } from 'mongoose';
import { IAppConfig } from '../../config';
import { UserLevelEnum } from '../../enums';
import { getLogger, logError, logInfo } from '../../log/util';
import { identityMiddleware, accessControlMiddlewareHOF } from '../../middlewares';
import { cacheService, notificationService } from '../../services';
import {
  HttpPOSTCreateNotification,
  HttpPOSTNotificationInteraction,
  NotificationInteractionUpsertOperationType,
  OBNotificationSchemaType,
} from '../../types';
import { mapDbNotificationsToApiPayload, mapNotificationApiRequestToServiceRequest } from '../../utils';
import { BaseController } from '../base_controller';

const logger = getLogger();

const authenticationMiddleware = pingAuthMiddleware({ logger });

export class NotificationController extends BaseController {
  public basePath: string;
  public router: express.Router;

  constructor(appConfig: IAppConfig) {
    super(appConfig.envConfig);
    this.basePath = `${this.API_BASE_URL}/notifications`;
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
      this.createNotification,
    );
    this.router.get(
      `${this.basePath}`,
      accessControlMiddlewareHOF([
        UserLevelEnum.FIELD_STAFF,
        UserLevelEnum.BRANCH_ADMIN,
        UserLevelEnum.ADMIN,
        UserLevelEnum.CONTROLLED_ADMIN,
        UserLevelEnum.SUPER_ADMIN,
      ]),
      this.listNotifications,
    );
    this.router.post(
      `${this.basePath}/subscribe`,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF, UserLevelEnum.BRANCH_ADMIN]),
      this.subscribeToTopics,
    );
    this.router.post(
      `${this.basePath}/unsubscribe`,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF, UserLevelEnum.BRANCH_ADMIN]),
      this.unsubscribeFromTopics,
    );
    this.router.post(
      `${this.basePath}/:notificationId/interactions`,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF, UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      this.notificationInteraction,
    );
  }

  private subscribeToTopics = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] subscribeToTopic - INITIATED`);

    try {
      const { token, topics } = request.body;

      if (!token || !Array.isArray(topics)) {
        throw new Error('Required fields are missing or incorrect');
      }

      const subscriptionPromises = topics.map((topic: string) => {
        return notificationService.subscribeToTopic(transactionId, token, topic);
      });

      await Promise.all(subscriptionPromises);

      response.status(HttpStatusCode.OK).json({
        success: true,
        message: `Subscribed to topics: ${topics.join(', ')}`,
      });
    } catch (error) {
      logError(`[${transactionId}] [CONTROLLER] subscribeToTopic - FAILED, reason: ${error.message}`);
      next(error);
    }
  };

  private unsubscribeFromTopics = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] unsubscribeFromTopic - INITIATED`);

    try {
      const { token, topics } = request.body;

      if (!token || !Array.isArray(topics)) {
        throw new Error('Required fields are missing or incorrect');
      }

      const unSubscriptionPromises = topics.map((topic: string) => {
        return notificationService.unsubscribeFromTopic(transactionId, token, topic);
      });

      await Promise.all(unSubscriptionPromises);

      response.status(HttpStatusCode.OK).json({
        success: true,
        message: `Unsubscribed from topics: ${topics.join(', ')}`,
      });
    } catch (error) {
      logError(`[${transactionId}] [CONTROLLER] unsubscribeFromTopic - FAILED, reason: ${error.message}`);
      next(error);
    }
  };

  private createNotification = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] createNotification - INITIATED`);

    try {
      const notification: HttpPOSTCreateNotification = request.body;

      const { obUserPsId, displayName } = request.obUserIdentity;

      notification.createdBy = { displayName, employeePsId: obUserPsId };

      const translatedNotification = mapNotificationApiRequestToServiceRequest(notification);

      const createdNotification = await notificationService.sendNotification(transactionId, translatedNotification);

      logInfo(`[${transactionId}] [CONTROLLER] createNotification - SUCCESSFUL`);

      response.status(HttpStatusCode.OK).json({
        success: true,
        data: createdNotification,
      });
    } catch (createErr) {
      logError(`[${transactionId}] [CONTROLLER] createNotification FAILED, reason: ${createErr.message}`);

      next(createErr);
    }
  };

  private listNotifications = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] listNotifications - INITIATED`);

    try {
      const { obUserPsId, branchIds: userBranchIds } = request.obUserIdentity;

      const {
        skip,
        limit,
        sortField,
        sortOrder,
      }: {
        skip?: string;
        limit?: string;
        sortField?: string;
        sortOrder?: 'asc' | 'desc';
      } = request.query;

      const filters: FilterQuery<OBNotificationSchemaType> = {};

      if (!userBranchIds.includes('*')) {
        filters.branchIds = { $in: userBranchIds };
      }

      const notifications = await notificationService.getUserNotificationsByFilter(
        transactionId,
        {
          ...filters,
          userPsIds: { $in: [obUserPsId] },
          $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $eq: null } }, { expiresAt: { $gte: new Date() } }],
          isDeleted: false,
        },
        {
          limit: +limit || 10,
          skip: +skip || 0,
          sortField,
          sortOrder,
        },
      );

      logInfo(`[${transactionId}] [CONTROLLER] listNotifications retrieved`);

      const mappedNotifications = notifications.map((notification) => mapDbNotificationsToApiPayload(notification));

      logInfo(`[${transactionId}] [CONTROLLER] listNotifications - SUCCESSFUL`);

      response.status(HttpStatusCode.OK).json({
        success: true,
        data: mappedNotifications,
      });
    } catch (listErr) {
      logError(`[${transactionId}] [CONTROLLER] listNotifications FAILED, reason: ${listErr.message}`);

      next(listErr);
    }
  };

  private notificationInteraction = async (
    request: express.Request,
    response: express.Response,
    next: NextFunction,
  ) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] notificationInteraction - INITIATED`);

    try {
      const notificationInteraction: HttpPOSTNotificationInteraction = request.body;

      if (!notificationInteraction.notificationId || !notificationInteraction.interactionType) {
        throw new Error('Required fields are missing');
      }

      const { obUserPsId, displayName, profileImgLink } = request.obUserIdentity;

      const notificationInteractionData: NotificationInteractionUpsertOperationType = {
        notificationId: notificationInteraction.notificationId,
        interactionType: notificationInteraction.interactionType,
        interactedUserPsId: obUserPsId,
        userDisplayName: displayName,
      };

      if (profileImgLink) {
        notificationInteractionData.userImageLink = profileImgLink;
      }

      try {
        await notificationService.notificationInteraction(transactionId, notificationInteractionData);
      } catch (interactionErr) {
        if (interactionErr.message !== 'Notification Not Found!') {
          throw interactionErr;
        }

        logInfo(
          `[${transactionId}] [CONTROLLER] notificationInteraction fallback caching ${notificationInteraction.notificationId}`,
        );

        // Fallback and hold the interaction in cache
        await cacheService.persist(transactionId, {
          serviceName: 'alertService',
          identifier: `${obUserPsId}_${notificationInteraction.notificationId}`,
          data: { ...notificationInteraction, interactedAt: Date.now() },
          expires: '60d',
        });
      }

      logInfo(`[${transactionId}] [CONTROLLER] notificationInteraction - SUCCESSFUL`);

      return response.status(HttpStatusCode.OK).json({ success: true, message: 'Success' });
    } catch (error) {
      logError(`[${transactionId}] [CONTROLLER] notificationInteraction FAILED, reason: ${error.message}`);

      next(error);
    }
  };
}
