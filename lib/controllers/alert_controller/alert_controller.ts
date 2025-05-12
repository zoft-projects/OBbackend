import { HttpStatusCode } from '@bayshore-healthcare/lib-error-middleware';
import { pingAuthMiddleware } from '@bayshore-healthcare/lib-ping-authentication-middleware';
import express, { NextFunction } from 'express';
import { FilterQuery } from 'mongoose';
import { IAppConfig } from '../../config';
import { NotificationTypeEnum, UserLevelEnum } from '../../enums';
import { getLogger, logError, logInfo } from '../../log/util';
import { identityMiddleware, accessControlMiddlewareHOF } from '../../middlewares';
import { alertService, notificationService } from '../../services';
import {
  HttpPOSTAlertInteraction,
  HttpPOSTCreateOBAlert,
  OBAlertStatus,
  OBAlertsSchemaType,
  OBNotificationSchemaType,
} from '../../types';
import {
  mapAlertApiRequestToServiceRequest,
  mapAlertInteractionRequestToServiceRequest,
  mapDBAlertToApiPayload,
  mapDbNotificationToAlertApiPayload,
} from '../../utils';
import { BaseController } from '../base_controller';

const logger = getLogger();

const authenticationMiddleware = pingAuthMiddleware({ logger });

export class AlertController extends BaseController {
  public basePath: string;
  public router: express.Router;

  constructor(appConfig: IAppConfig) {
    super(appConfig.envConfig);
    this.basePath = `${this.API_BASE_URL}/alerts`;
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
      this.getAlerts,
    );
    this.router.post(
      `${this.basePath}`,
      accessControlMiddlewareHOF([UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      this.createAlert,
    );
    this.router.get(
      `${this.basePath}/:alertId`,
      accessControlMiddlewareHOF([
        UserLevelEnum.FIELD_STAFF,
        UserLevelEnum.BRANCH_ADMIN,
        UserLevelEnum.ADMIN,
        UserLevelEnum.CONTROLLED_ADMIN,
        UserLevelEnum.SUPER_ADMIN,
      ]),
      this.getAlertById,
    );
    this.router.post(
      `${this.basePath}/:alertId/reaction`,
      accessControlMiddlewareHOF([
        UserLevelEnum.FIELD_STAFF,
        UserLevelEnum.BRANCH_ADMIN,
        UserLevelEnum.ADMIN,
        UserLevelEnum.CONTROLLED_ADMIN,
        UserLevelEnum.SUPER_ADMIN,
      ]),
      this.alertInteracted,
    );
    this.router.delete(
      `${this.basePath}/:alertId`,
      accessControlMiddlewareHOF([UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      this.removeAlert,
    );
  }

  private getAlerts = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] getAlerts initiated`);

    try {
      const {
        skip,
        limit,
        status,
        search,
        sortField = 'createdAt',
        sortOrder = 'desc',
      }: {
        skip?: string;
        limit?: string;
        status?: OBAlertStatus;
        sortField?: string;
        sortOrder?: 'asc' | 'desc';
        search?: string;
      } = request.query;

      const {
        branchIds: userBranchIds,
        divisionIds: userDivisionIds,
        provinceCodes: userProvinceCodes,
      } = request.obUserIdentity;

      // Define filters for alert data
      const filters: FilterQuery<OBAlertsSchemaType> = { isDeleted: false };

      const actualLimit = +limit || 100;
      const skipPage = +skip || 0;
      if (status && status in OBAlertStatus) {
        filters.status = status;
      }

      logInfo(
        `[${transactionId}] [CONTROLLER] getAlerts query requested for filters: ${JSON.stringify(
          filters,
        )}, limit: ${actualLimit}`,
      );
      // Query alerts collection
      const alertData = await alertService.getAlerts(
        transactionId,
        {
          branchIds: userBranchIds,
          divisionIds: userDivisionIds,
          provincialCodes: userProvinceCodes,
        },
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
      // Query notifications collection
      const notificationData = await notificationService.getNotifications(
        transactionId,
        {
          branchIds: userBranchIds,
          divisionIds: userDivisionIds,
          provincialCodes: userProvinceCodes,
          notificationType: NotificationTypeEnum.Group,
          ...filters,
        },
        {
          skip: skipPage,
          limit: actualLimit,
          sortField,
          sortOrder,
          search,
        },
      );
      const mappedAlerts = alertData.map((alert) => mapDBAlertToApiPayload(alert));
      const mappedNotifications = notificationData.map((notification) =>
        mapDbNotificationToAlertApiPayload(notification),
      );
      const responseBody = [...mappedNotifications, ...mappedAlerts];
      response.status(HttpStatusCode.OK).json(responseBody);
    } catch (alertErr) {
      logError(`[${transactionId}] [CONTROLLER] getAlerts FAILED, reason: ${alertErr.message}`);
      next(alertErr);
    }
  };

  private createAlert = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] Create Alert initiated`);

    try {
      const alert: HttpPOSTCreateOBAlert = request.body;

      const { obUserPsId, displayName, accessLvl } = request.obUserIdentity;
      alert.jobLevels = [accessLvl];

      // TODO update after migration
      alert.createdById = alert.createdById ? alert.createdById : obUserPsId;
      alert.createdByName = alert.createdByName ? alert.createdByName : displayName;

      const translatedAlert = mapAlertApiRequestToServiceRequest(alert);

      const createdAlert = await alertService.createAlert(transactionId, translatedAlert);

      response.status(HttpStatusCode.OK).json({
        success: true,
        data: createdAlert,
      });
    } catch (err) {
      logError(`[${transactionId}] [CONTROLLER] createAlert endpoint failed with error: ${err.message}`);

      next(err);
    }
  };

  private getAlertById = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;
    logInfo(`[${transactionId}] [CONTROLLER] getAlert initiated`);

    try {
      const { alertId }: { alertId?: string } = request.params;

      if (!alertId) {
        throw new Error('Unable to get alert, please provide the alertId!');
      }

      if (!alertId.startsWith('AL') && !alertId.startsWith('NOTIF')) {
        throw new Error('Invalid alertId format');
      }

      logInfo(`[${transactionId}] [CONTROLLER] getAlert retrieving for alertId: ${alertId}`);

      const obAlert = alertId.startsWith('AL')
        ? await alertService.getAlertById(transactionId, alertId)
        : await notificationService.getNotificationById(transactionId, alertId);

      if (!obAlert) {
        response.status(HttpStatusCode.OK).json(null);

        return;
      }

      const alert = alertId.startsWith('AL')
        ? mapDBAlertToApiPayload(obAlert as OBAlertsSchemaType)
        : mapDbNotificationToAlertApiPayload(obAlert as OBNotificationSchemaType);

      logInfo(`[${transactionId}] [CONTROLLER] getAlert retrieved alert: ${JSON.stringify(alert)}`);
      response.status(HttpStatusCode.OK).json(alert);
    } catch (getErr) {
      logError(`[${transactionId}] [CONTROLLER] getAlert failed, reason: ${getErr.message}`);
      next(getErr);
    }
  };

  private alertInteracted = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] Alert Interacted initiated`);

    try {
      const alertInteraction: HttpPOSTAlertInteraction = request.body;

      if (!alertInteraction.alertId || !alertInteraction.interactionType) {
        throw new Error('Required fields are missing');
      }

      const translatedInteraction = mapAlertInteractionRequestToServiceRequest(alertInteraction);

      const { obUserPsId } = request.obUserIdentity;

      // TODO remove check after migration
      if (!translatedInteraction.interactedUserPsId) {
        translatedInteraction.interactedUserPsId = obUserPsId;
      }
      await alertService.alertInteracted(transactionId, translatedInteraction);

      return response.status(HttpStatusCode.OK).json({ message: 'Success' });
    } catch (err) {
      logError(`[${transactionId}] [CONTROLLER] Alert interaction endpoint failed with error: ${err.message}`);

      next(err);
    }
  };

  private removeAlert = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] removeAlert initiated`);
    try {
      const { alertId }: { alertId?: string } = request.params;
      const { forceDelete: shouldForceDelete }: { forceDelete?: string } = request.query;
      const forceDelete: boolean = shouldForceDelete === 'true';

      if (!alertId) {
        throw new Error('Unable to remove alert, please provide the mandatory details!');
      }

      logInfo(`[${transactionId}] [CONTROLLER] removeAlert check alert exists for alertId: ${alertId}`);

      const alertToRemove = await alertService.getAlertById(transactionId, alertId);
      const notificationToRemove = await notificationService.getNotificationById(transactionId, alertId);
      if (!alertToRemove && !notificationToRemove) {
        throw new Error(`Cannot remove an alert with alertId: ${alertId} because it does not exist in the system`);
      }
      if (alertToRemove) {
        logInfo(`[${transactionId}] [CONTROLLER] removeAlert removing alert: ${JSON.stringify(alertToRemove)}`);
        await alertService.removeAlertByAlertId(transactionId, alertId, forceDelete);
        logInfo(`[${transactionId}] [CONTROLLER] removeAlert SUCCESSFUL alertId: ${alertId}`);
      }
      if (notificationToRemove) {
        logInfo(`[${transactionId}] [CONTROLLER] removing notification: ${JSON.stringify(alertToRemove)}`);
        await notificationService.removeNotificationById(transactionId, alertId, forceDelete);
        logInfo(`[${transactionId}] [CONTROLLER] SUCCESSFUL remove notification, notificationId: ${alertId}`);
      }
      response.status(HttpStatusCode.OK).json({
        success: true,
        message: `Alert removed successfully for ${alertId}`,
      });
    } catch (removeErr) {
      logError(`[${transactionId}] [CONTROLLER] removeAlert/ notification FAILED, reason: ${removeErr.message}`);

      next(removeErr);
    }
  };
}
