import { HttpStatusCode } from '@bayshore-healthcare/lib-error-middleware';
import { pingAuthMiddleware } from '@bayshore-healthcare/lib-ping-authentication-middleware';
import { startOfMonth, endOfMonth, parseISO } from 'date-fns';
import express, { NextFunction } from 'express';
import { IAppConfig } from '../../config';
import { AudienceEnum, UserLevelEnum } from '../../enums';
import { getLogger, logError, logInfo } from '../../log/util';
import { identityMiddleware, accessControlMiddlewareHOF } from '../../middlewares';
import { featureSummariesService } from '../../services';
import { mapMetricsToApiPayload } from '../../utils';
import { BaseController } from '../base_controller';

const logger = getLogger();

const authenticationMiddleware = pingAuthMiddleware({ logger });

export class MetricsController extends BaseController {
  public basePath: string;
  public router: express.Router;

  constructor(appConfig: IAppConfig) {
    super(appConfig.envConfig);
    this.basePath = `${this.API_BASE_URL}/metrics`;
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
        UserLevelEnum.BRANCH_ADMIN,
        UserLevelEnum.ADMIN,
        UserLevelEnum.CONTROLLED_ADMIN,
        UserLevelEnum.SUPER_ADMIN,
      ]),
      this.getMetricsSummary,
    );
  }

  private getMetricsSummary = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;
    logInfo(`[${transactionId}] [CONTROLLER] getMetricsSummary initiated`);

    const { branchIds } = request.obUserIdentity;
    const { fromDate, toDate }: { fromDate?: string; toDate?: string } = request.query;

    try {
      const identifiers = Array.isArray(branchIds) ? branchIds : [branchIds];
      const currentDate = new Date();

      // Start of current month
      const start = fromDate ? parseISO(fromDate as string) : startOfMonth(currentDate);

      // End of current month
      const end = toDate ? parseISO(toDate as string) : endOfMonth(currentDate);

      const summary = await featureSummariesService.getMetricsSummaryByDates(
        transactionId,
        AudienceEnum.Branch,
        identifiers,
        start,
        end,
      );

      response.status(HttpStatusCode.OK).json(mapMetricsToApiPayload(summary));
    } catch (error) {
      logError(`[${transactionId}] [CONTROLLER] getMetricsSummary FAILED, reason: ${error.message}`);
      next(error);
    }
  };
}
