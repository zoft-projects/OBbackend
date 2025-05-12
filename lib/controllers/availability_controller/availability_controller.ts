import { pingAuthMiddleware } from '@bayshore-healthcare/lib-ping-authentication-middleware';
import { NextFunction } from 'connect';
import { isValid, parseISO } from 'date-fns';
import express from 'express';
import { IAppConfig } from '../../config';
import { HttpStatusCode, UserLevelEnum } from '../../enums';
import { ValidationError } from '../../errors/validation_error';
import { logError, logInfo, getLogger } from '../../log/util';
import { identityMiddleware, serviceInternalMiddleware, accessControlMiddlewareHOF } from '../../middlewares';
import { availabilityService, clientService, notificationService } from '../../services';
import {
  ClientFromSystemType,
  HTTPPostAvailabilityOnetimeInputType,
  DetailedOnetimeAvailabilityType,
  ScheduleSummaryGetType,
  HttpPOSTAvailabilityPushNotification,
  NotificationUpsertOperationType,
  HTTPPostRecurringAvailabilityInputType,
} from '../../types';
import {
  mapAvailabilityNotificationHttpToOperationType,
  mapDbAvailabilityToApiPayload,
  mapDbOnetimeToApiPayload,
  mapOnetimeApiRequestToServiceRequest,
  mapRecurringAvailabilityApiRequestToServiceRequest,
} from '../../utils';
import { BaseController } from '../base_controller';

const logger = getLogger();

const authenticationMiddleware = pingAuthMiddleware({ logger });

export class AvailabilityController extends BaseController {
  public basePath: string;
  public router: express.Router;

  constructor(appConfig: IAppConfig) {
    super(appConfig.envConfig);
    this.basePath = `${this.API_BASE_URL}/availabilities`;
    this.router = express.Router();
    this.initializeRoutes();
  }

  public getBasePath(): string {
    return this.basePath;
  }

  public initializeRoutes(): void {
    this.router.get(
      `${this.basePath}`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([
        UserLevelEnum.FIELD_STAFF,
        UserLevelEnum.BRANCH_ADMIN,
        UserLevelEnum.ADMIN,
        UserLevelEnum.CONTROLLED_ADMIN,
        UserLevelEnum.SUPER_ADMIN,
      ]),
      this.asyncHandler(this.getSchedulesFromAvailability),
    );
    this.router.post(
      `${this.basePath}/onetime`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF, UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      this.asyncHandler(this.createOnetimeAvailability),
    );
    this.router.post(
      `${this.basePath}/recurring`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF, UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      this.asyncHandler(this.createRecurringAvailability),
    );
    this.router.get(
      `${this.basePath}/onetime`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([
        UserLevelEnum.FIELD_STAFF,
        UserLevelEnum.BRANCH_ADMIN,
        UserLevelEnum.ADMIN,
        UserLevelEnum.CONTROLLED_ADMIN,
        UserLevelEnum.SUPER_ADMIN,
      ]),
      this.asyncHandler(this.getOnetimeAvailabilities),
    );
    this.router.post(
      `${this.basePath}/notification`,
      serviceInternalMiddleware,
      this.asyncHandler(this.createPushNotification),
    );
  }

  private getSchedulesFromAvailability = async (
    request: express.Request,
    response: express.Response,
    next: NextFunction,
  ) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] getSchedulesFromAvailability initiated`);

    try {
      const { systemIdentifiers } = request.obUserIdentity;

      let systemIdentifiersUpdated = systemIdentifiers || [];

      const calcomTenantExists = (systemIdentifiers || []).find(
        (system) => system.systemName === 'calcom' && system.tenantId === 'Calcom_Default',
      );

      // if calcom tenant exists check availability of that alone
      if (calcomTenantExists) {
        systemIdentifiersUpdated = [calcomTenantExists];
      }
      const { startDate, endDate } = request.query;

      logInfo(
        `[${transactionId}] [CONTROLLER] getSchedulesFromAvailability for systemIdentifiers: ${JSON.stringify(
          systemIdentifiersUpdated,
        )}, start date: ${startDate} and end date: ${endDate}`,
      );

      const startDateFormatted = new Date(parseISO(`${startDate}`));
      const endDateFormatted = new Date(parseISO(`${endDate}`));

      if (!isValid(startDateFormatted) || !isValid(endDateFormatted)) {
        throw new ValidationError('Date validation failed');
      }

      const schedules: ScheduleSummaryGetType[] = await availabilityService.getSchedulesFromAvailabilityService(
        transactionId,
        {
          systemIdentifiers: systemIdentifiersUpdated,
          startDate: startDateFormatted,
          endDate: endDateFormatted,
        },
      );

      if (!schedules) {
        response.status(HttpStatusCode.OK).json({
          success: false,
          data: [],
        });

        return;
      }

      const clientPsIdFromVisits = [
        ...new Set(
          (schedules || [])
            .map((schedule) => {
              const validClientPsIds: string[] = [];
              schedule.visits.forEach((visit) => {
                // removing invalid psid from the client psid list
                if (visit.clientPsId && visit.clientPsId !== 'UNKNOWN_PSID') {
                  validClientPsIds.push(visit.clientPsId);
                }
              });

              return validClientPsIds;
            })
            .flat(),
        ),
      ];

      let clientDetails: ClientFromSystemType[] = [];
      if (clientPsIdFromVisits.length > 0) {
        clientDetails = await clientService.getClientDetailByClientPsIds(transactionId, clientPsIdFromVisits);
      }

      logInfo(
        `[${transactionId}] [CONTROLLER] getSchedulesFromAvailability for systemIdentifiers: ${JSON.stringify(
          systemIdentifiersUpdated,
        )}, start date: ${startDate} and end date: ${endDate} Successful`,
      );

      response.status(HttpStatusCode.OK).json({
        success: schedules.length > 0,
        data: mapDbAvailabilityToApiPayload(schedules, clientDetails),
      });
    } catch (err) {
      logError(`[${transactionId}] [CONTROLLER] getSchedulesFromAvailability FAILED, reason: ${err.message}`);

      next(err);
    }
  };

  private createOnetimeAvailability = async (
    request: express.Request,
    response: express.Response,
    next: NextFunction,
  ) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] updateOnetimeAvailabilities initiated`);

    try {
      const { systemIdentifiers, displayName, obUserPsId } = request.obUserIdentity;

      let systemIdentifiersUpdated = systemIdentifiers || [];

      const calcomTenantExists = (systemIdentifiers || []).find(
        (system) => system.systemName === 'calcom' && system.tenantId === 'Calcom_Default',
      );

      // if calcom tenant exists check availability of that alone
      if (calcomTenantExists) {
        systemIdentifiersUpdated = [calcomTenantExists];
      }

      const createOnetimeDetails: HTTPPostAvailabilityOnetimeInputType = {
        ...request.body,
        employeePsId: obUserPsId,
        givenName: displayName,
      };

      if (!isValid(new Date(createOnetimeDetails.date))) {
        throw new ValidationError('Date validation failed');
      }

      (createOnetimeDetails.timeSlots || []).forEach((timeSlot) => {
        if (timeSlot.start && !isValid(new Date(timeSlot.start))) {
          throw new ValidationError('Date validation failed');
        }
        if (timeSlot.end && !isValid(new Date(timeSlot.end))) {
          throw new ValidationError('Date validation failed');
        }
      });

      const updatedOneTimeAvailabilities: { success: boolean; updatedEmployeeIds: string[] } =
        await availabilityService.createOnetimeAvailabilities(
          transactionId,
          systemIdentifiersUpdated,
          mapOnetimeApiRequestToServiceRequest(createOnetimeDetails),
        );

      logInfo(
        `[${transactionId}] [CONTROLLER] updateOnetimeAvailabilities SUCCESSFUL for psId: ${request.obUserIdentity.obUserPsId}`,
      );

      response.status(HttpStatusCode.OK).json({
        success: updatedOneTimeAvailabilities.success,
        data: updatedOneTimeAvailabilities.updatedEmployeeIds,
      });
    } catch (err) {
      logError(`[${transactionId}] [CONTROLLER] updateOnetimeAvailabilities FAILED, reason: ${err.message}`);

      next(err);
    }
  };

  private createRecurringAvailability = async (
    request: express.Request,
    response: express.Response,
    next: NextFunction,
  ) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] updateRecurringAvailabilities initiated`);

    try {
      const { systemIdentifiers, obUserPsId } = request.obUserIdentity;

      let systemIdentifiersUpdated = systemIdentifiers || [];

      const calcomTenantExists = (systemIdentifiers || []).find(
        (system) => system.systemName === 'calcom' && system.tenantId === 'Calcom_Default',
      );
      // if calcom tenant exists check availability of that alone
      if (calcomTenantExists) {
        systemIdentifiersUpdated = [calcomTenantExists];
      }

      const createRecurringAvailabilityDetails: HTTPPostRecurringAvailabilityInputType = {
        ...request.body,
        employeeId: obUserPsId,
      };

      const updatedRecurringAvailabilities: { success: boolean; updatedEmployeeIds: string[] } =
        await availabilityService.createRecurringAvailabilities(
          transactionId,
          systemIdentifiersUpdated,
          mapRecurringAvailabilityApiRequestToServiceRequest(createRecurringAvailabilityDetails),
        );

      logInfo(
        `[${transactionId}] [CONTROLLER] updateRecurringAvailabilities SUCCESSFUL for psId: ${request.obUserIdentity.obUserPsId}`,
      );

      response.status(HttpStatusCode.OK).json({
        success: updatedRecurringAvailabilities.success,
        data: updatedRecurringAvailabilities.updatedEmployeeIds,
      });
    } catch (err) {
      logError(`[${transactionId}] [CONTROLLER] updateRecurringAvailabilities FAILED, reason: ${err.message}`);

      next(err);
    }
  };

  private getOnetimeAvailabilities = async (
    request: express.Request,
    response: express.Response,
    next: NextFunction,
  ) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] getOnetimeAvailabilities initiated`);

    try {
      const { systemIdentifiers } = request.obUserIdentity;
      const { status = 'pending' }: { status?: string } = request.query;

      logInfo(
        `[${transactionId}] [CONTROLLER] getOnetimeAvailabilities with status:${status} for systemIdentifiers: ${JSON.stringify(
          systemIdentifiers,
        )}`,
      );

      const onetimeAvailabilities: DetailedOnetimeAvailabilityType[] =
        await availabilityService.getOnetimeAvailabilities(transactionId, systemIdentifiers, status);

      response.status(HttpStatusCode.OK).json({
        success: onetimeAvailabilities.length > 0,
        data: mapDbOnetimeToApiPayload(onetimeAvailabilities),
      });
    } catch (err) {
      logError(`[${transactionId}] [CONTROLLER] getAllOnetimeAvailabilities FAILED, reason: ${err.message}`);

      next(err);
    }
  };

  private createPushNotification = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] createPushNotification INITIATED`);

    try {
      const notification: HttpPOSTAvailabilityPushNotification = request.body;

      logInfo(
        `[${transactionId}] [CONTROLLER] createPushNotification received request payload ${JSON.stringify(
          notification,
        )}`,
      );

      if (!notification.employeePsId || !notification.notificationBody || !notification.notificationTitle) {
        throw new Error('Either employeePsId or notificationBody or notificationTitle are missing.');
      }

      const mappedNotification: NotificationUpsertOperationType =
        mapAvailabilityNotificationHttpToOperationType(notification);

      logInfo(
        `[${transactionId}] [CONTROLLER] createPushNotification created mapped payload ${JSON.stringify(
          mappedNotification,
        )}`,
      );

      const sentPushNotificationId = await notificationService.sendNotification(transactionId, mappedNotification);

      logInfo(
        `[${transactionId}] [CONTROLLER] createPushNotification SUCCESSFULLY created availability push notification with notificationId: ${sentPushNotificationId}`,
      );

      response.status(HttpStatusCode.OK).json({
        success: true,
        data: `${sentPushNotificationId}`,
      });
    } catch (createErr) {
      logError(`[${transactionId}] [CONTROLLER] createPushNotification FAILED, reason: ${createErr.message}`);

      next(createErr);
    }
  };
}
