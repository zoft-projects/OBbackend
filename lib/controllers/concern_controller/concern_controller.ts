import { HttpStatusCode } from '@bayshore-healthcare/lib-error-middleware';
import { pingAuthMiddleware } from '@bayshore-healthcare/lib-ping-authentication-middleware';
import express, { NextFunction } from 'express';
import { IAppConfig } from '../../config';
import { AnonymizedTypeEnum, UserLevelEnum } from '../../enums';
import { getLogger, logError, logInfo } from '../../log/util';
import { identityMiddleware, accessControlMiddlewareHOF } from '../../middlewares';
import { anonymizedInfoService } from '../../services';
import { HttpPOSTCreateOBConcern, OBAnonymizedInfoCreateOperationType } from '../../types';
import { mapAnonymizedInfoToConcernPayload } from '../../utils';
import { BaseController } from '../base_controller';

const logger = getLogger();

const authenticationMiddleware = pingAuthMiddleware({ logger });

export class ConcernController extends BaseController {
  public basePath: string;
  public router: express.Router;

  constructor(appConfig: IAppConfig) {
    super(appConfig.envConfig);
    this.basePath = `${this.API_BASE_URL}/concerns`;
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
      this.createConcern,
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
      this.listConcerns,
    );
  }

  private createConcern = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] createConcern initiated`);

    try {
      const {
        concern,
        canIncludeIdentity = true,
        concernedUserName,
        concernedUserId,
        concernedUserEmail,
        createdAt,
      }: HttpPOSTCreateOBConcern = request.body;

      const { obUserPsId, displayName, email } = request.obUserIdentity;

      const payload = {
        concern,
        concernedUserId: concernedUserId || obUserPsId,
        concernedUserName: concernedUserName || displayName,
        canIncludeIdentity: canIncludeIdentity ?? true,
      };

      const data: OBAnonymizedInfoCreateOperationType = {
        identifier: concernedUserId ? `${concernedUserId}__v_${Date.now()}` : `${obUserPsId}__v_${Date.now()}`,
        infoKey: AnonymizedTypeEnum.Concern,
        infoValue: `${concernedUserName ?? displayName}|${concernedUserEmail ?? email}`,
        infoType: 'concern',
        payload,
        createdAt,
      };

      await anonymizedInfoService.createOBAnonymizedInfo(transactionId, data);

      logInfo(`[${transactionId}] [CONTROLLER] createConcern COMPLETED`);

      response.status(HttpStatusCode.OK).json({
        success: true,
        message: 'Your concern has been received successfully. Thank you for reaching out!',
      });
    } catch (err) {
      logError(`[${transactionId}] [CONTROLLER] createConcern endpoint failed with error: ${err.message}`);

      next(err);
    }
  };

  private listConcerns = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] listConcerns initiated`);

    try {
      const {
        skip,
        limit,
        search,
      }: {
        skip?: string;
        limit?: string;
        search?: string;
      } = request.query;

      logInfo(
        `[${transactionId}] [CONTROLLER] listConcerns query requested for concern type: ${
          AnonymizedTypeEnum.Concern
        }, limit: ${+limit || 10}, skip: ${+skip || 0}`,
      );

      const concerns = await anonymizedInfoService.getConcernsByFilter(transactionId, {
        skip: +skip || 0,
        limit: +limit || 10,
        search,
      });

      logInfo(`[${transactionId}] [CONTROLLER] listConcerns COMPLETED`);

      const mappedConcerns = concerns.map((concern) => mapAnonymizedInfoToConcernPayload(concern));

      response.status(HttpStatusCode.OK).json(mappedConcerns);
    } catch (listErr) {
      logError(`[${transactionId}] [CONTROLLER] listConcerns FAILED, reason: ${listErr.message}`);
      next(listErr);
    }
  };
}
