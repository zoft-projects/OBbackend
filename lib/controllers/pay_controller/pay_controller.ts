import { HttpStatusCode } from '@bayshore-healthcare/lib-error-middleware';
import { pingAuthMiddleware } from '@bayshore-healthcare/lib-ping-authentication-middleware';
import express, { NextFunction } from 'express';
import { IAppConfig } from '../../config';
import { UserLevelEnum } from '../../enums';
import { getLogger, logError, logInfo } from '../../log/util';
import { identityMiddleware, accessControlMiddlewareHOF } from '../../middlewares';
import { payService } from '../../services';
import { BaseController } from '../base_controller';

const logger = getLogger();

const authenticationMiddleware = pingAuthMiddleware({ logger });

export class PayController extends BaseController {
  public basePath: string;
  public router: express.Router;

  constructor(appConfig: IAppConfig) {
    super(appConfig.envConfig);
    this.basePath = `${this.API_BASE_URL}/pay`;
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
        UserLevelEnum.SUPER_ADMIN,
      ]),
      this.getPaySummaries,
    );
    this.router.get(
      `${this.basePath}/:payCheckId/stub`,
      accessControlMiddlewareHOF([
        UserLevelEnum.FIELD_STAFF,
        UserLevelEnum.BRANCH_ADMIN,
        UserLevelEnum.ADMIN,
        UserLevelEnum.SUPER_ADMIN,
      ]),
      this.getPayStub,
    );
  }

  private getPaySummaries = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;
    const { obUserPsId } = request.obUserIdentity;

    logInfo(`[${transactionId}] [CONTROLLER] getPaySummaries - INITIATED`);

    try {
      const paySummaries = await payService.getPaySummaries(transactionId, obUserPsId, request.headers.authorization);

      response.status(HttpStatusCode.OK).send(paySummaries);
    } catch (fetchErr) {
      logError(`[${transactionId}] [CONTROLLER] getPaySummaries failed, reason: ${fetchErr.message}`);

      next(fetchErr);
    }
  };

  private getPayStub = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;
    const { obUserPsId } = request.obUserIdentity;

    logInfo(`[${transactionId}] [CONTROLLER] getPayStub - INITIATED`);

    try {
      const { payCheckId } = request.params;

      const payStubRawData = await payService.getPayStub(
        transactionId,
        obUserPsId,
        payCheckId,
        request.headers.authorization,
      );

      response.status(HttpStatusCode.OK).send(payStubRawData);
    } catch (fetchErr) {
      logError(`[${transactionId}] [CONTROLLER] getPayStub failed, reason: ${fetchErr.message}`);

      next(fetchErr);
    }
  };
}
