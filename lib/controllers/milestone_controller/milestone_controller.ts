import { HttpStatusCode } from '@bayshore-healthcare/lib-error-middleware';
import { pingAuthMiddleware } from '@bayshore-healthcare/lib-ping-authentication-middleware';
import express, { NextFunction } from 'express';
import { IAppConfig } from '../../config';
import { UserLevelEnum } from '../../enums';
import { getLogger, logError, logInfo } from '../../log/util';
import { identityMiddleware, accessControlMiddlewareHOF } from '../../middlewares';
import { milestoneService } from '../../services';
import { HttpPOSTCreateOBMilestone } from '../../types';
import { BaseController } from '../base_controller';
const logger = getLogger();

const authenticationMiddleware = pingAuthMiddleware({ logger });

export class MilestoneController extends BaseController {
  public basePath: string;
  public router: express.Router;

  constructor(appConfig: IAppConfig) {
    super(appConfig.envConfig);
    this.basePath = `${this.API_BASE_URL}/milestones`;
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
      accessControlMiddlewareHOF([UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.ADMIN]),
      this.createMilestones,
    );
    // TODO: temp scheduler testing URL
    this.router.get(
      `${this.basePath}/scheduler`,
      accessControlMiddlewareHOF([UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.ADMIN]),
      this.scheduler,
    );
  }

  private createMilestones = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] createMilestone initiated`);

    try {
      const milestones: HttpPOSTCreateOBMilestone[] = request.body;
      const createdMilestone = await milestoneService.createMilestones(transactionId, { milestoneTasks: milestones });
      response.status(HttpStatusCode.OK).json({
        success: true,
        data: createdMilestone,
      });
    } catch (createErr) {
      logError(`[${transactionId}] [CONTROLLER] createMilestone FAILED, reason: ${createErr.message}`);

      next(createErr);
    }
  };

  private scheduler = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] scheduler initiated`);

    try {
      await milestoneService.notifyMilestonePrerequisites(transactionId);
      response.status(HttpStatusCode.OK).json({
        success: true,
      });
    } catch (getErr) {
      logError(`[${transactionId}] [CONTROLLER] scheduler FAILED, reason: ${getErr.message}`);

      next(getErr);
    }
  };
}
