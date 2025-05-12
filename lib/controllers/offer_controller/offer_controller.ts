import { pingAuthMiddleware } from '@bayshore-healthcare/lib-ping-authentication-middleware';
import { NextFunction } from 'connect';
import express from 'express';
import { IAppConfig } from '../../config';
import { HttpStatusCode, ShiftOfferStatusEnum, UserLevelEnum } from '../../enums';
import { generateRandomMockOffers } from '../../factories/offer_factory/offer_factory';
import { logError, logInfo, getLogger } from '../../log/util';
import { identityMiddleware, accessControlMiddlewareHOF } from '../../middlewares';
import { offerService } from '../../services';
import {
  VisitOccurrenceType,
  ShiftOfferResponsePayloadType,
  HTTPPutShiftOffersInputType,
  OffersPayloadType,
} from '../../types';
import { BaseController } from '../base_controller';

const logger = getLogger();

const authenticationMiddleware = pingAuthMiddleware({ logger });

export class OfferController extends BaseController {
  public basePath: string;
  public router: express.Router;

  constructor(appConfig: IAppConfig) {
    super(appConfig.envConfig);
    this.basePath = `${this.API_BASE_URL}/offers`;
    this.router = express.Router();
    this.router.use(this.basePath, authenticationMiddleware, identityMiddleware);
    this.initializeRoutes();
  }

  public getBasePath(): string {
    return this.basePath;
  }

  public initializeRoutes(): void {
    this.router.get(
      `${this.basePath}/mock`,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF, UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      this.asyncHandler(this.getMockShiftOffers),
    );
    this.router.put(
      `${this.basePath}/:offerId`,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF, UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      this.asyncHandler(this.sendShiftOfferResponse),
    );
  }

  private sendShiftOfferResponse = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] sendShiftOfferResponse initiated`);
    try {
      const { displayName, systemIdentifiers } = request.obUserIdentity;
      const body: HTTPPutShiftOffersInputType = request.body;

      if (
        !body.tenantId ||
        !body.visitOfferId ||
        !body.visitOfferListId ||
        !(body.responseStatus && body.responseStatus in ShiftOfferStatusEnum) ||
        !(body.responseType && body.responseType in VisitOccurrenceType)
      ) {
        throw new Error('Invalid body data passed to sendShiftOfferResponse request');
      }

      const procuraSystemIdentifiers = systemIdentifiers.filter(({ systemName }) => systemName === 'procura');

      const [firstMatchingSystem] = procuraSystemIdentifiers;

      if (!firstMatchingSystem || !firstMatchingSystem.empSystemId) {
        throw new Error('Missing required field: employeeId');
      }

      const employeeId = firstMatchingSystem?.empSystemId;

      logInfo(
        `[${transactionId}] [CONTROLLER] sendShiftOfferResponse: Creating payload for employeeId: [${employeeId}]`,
      );

      const payload: ShiftOfferResponsePayloadType = {
        employeeId,
        scheduleId: body.scheduleId ?? '',
        tenantId: body.tenantId,
        visitOfferId: body.visitOfferId,
        visitOfferListId: body.visitOfferListId,
        employeeName: displayName,
        responseDateTime: new Date(),
        responseStatus: body.responseStatus,
        responseType: body.responseType,
        responseReason: body?.responseReason ?? '',
      };
      logInfo(`[${transactionId}] [CONTROLLER] [sendShiftOfferResponse] payload: ${JSON.stringify(payload)}`);

      const responseData = await offerService.sendShiftOfferResponseToEventService(transactionId, payload);

      logInfo(`[${transactionId}] [CONTROLLER] [sendShiftOfferResponse] responseData: ${JSON.stringify(responseData)}`);

      response.status(HttpStatusCode.OK).json(responseData);
    } catch (err) {
      logError(`[${transactionId}] [CONTROLLER] sendShiftOfferResponse FAILED, reason: ${err.message}`);

      next(err);
    }
  };

  // TODO Remove mock after testing
  private getMockShiftOffers = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;
    const {
      limit,
    }: {
      limit?: string;
    } = request.query;
    try {
      logInfo(`[${transactionId}] [CONTROLLER] getMockShiftOffers initiated`);
      const max = +limit || 10;
      const mockData: OffersPayloadType[] = generateRandomMockOffers(max);
      logInfo(
        `[${transactionId}] [SERVICE] generateMockShiftOffers - SUCCESSFUL, generated ${mockData.length} records`,
      );

      response.status(HttpStatusCode.OK).json(mockData);
    } catch (error) {
      logError(`[${transactionId}] [CONTROLLER] getMockShiftOffers FAILED, reason: ${error.message}`);
      next(error);
    }
  };
}
