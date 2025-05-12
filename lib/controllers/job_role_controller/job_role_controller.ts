import { HttpStatusCode } from '@bayshore-healthcare/lib-error-middleware';
import { pingAuthMiddleware } from '@bayshore-healthcare/lib-ping-authentication-middleware';
import express, { NextFunction } from 'express';
import { IAppConfig } from '../../config';
import { ActiveStateEnum, UserLevelEnum } from '../../enums';
import { getLogger, logError, logInfo } from '../../log/util';
import { identityMiddleware, accessControlMiddlewareHOF } from '../../middlewares';
import { jobService } from '../../services';
import { OBJobOperationType, OBJobSchemaType } from '../../types';
import { mapJobOperationToDbRecord } from '../../utils';
import { BaseController } from '../base_controller';

const logger = getLogger();

const authenticationMiddleware = pingAuthMiddleware({ logger });

export class JobRoleController extends BaseController {
  public basePath: string;
  public router: express.Router;

  constructor(appConfig: IAppConfig) {
    super(appConfig.envConfig);
    this.basePath = `${this.API_BASE_URL}/job-roles`;
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
      this.getJobs,
    );
    this.router.post(
      `${this.basePath}`,
      accessControlMiddlewareHOF([UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      this.createJobRole,
    );
    this.router.put(
      `${this.basePath}/:jobId`,
      accessControlMiddlewareHOF([UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      this.updateJobRole,
    );
  }

  private getJobs = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] getJobs initiated`);
    const filters = { jobStatus: ActiveStateEnum.Active };

    try {
      const jobs = await jobService.getAllJobs(transactionId, filters);

      response.status(HttpStatusCode.OK).json(jobs);
    } catch (getErr) {
      logError(`[${transactionId}] [CONTROLLER] getJobs FAILED, reason: ${getErr.message}`);

      next(getErr);
    }
  };

  private createJobRole = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] createJobRole initiated`);

    try {
      const jobData: OBJobOperationType = request.body;

      const translatedJob = mapJobOperationToDbRecord(jobData);

      const createdJob = await jobService.createJob(transactionId, translatedJob as OBJobSchemaType);

      response.status(HttpStatusCode.OK).json(createdJob);
    } catch (createErr) {
      logError(`[${transactionId}] [CONTROLLER] createJobRole FAILED, reason: ${createErr.message}`);

      next(createErr);
    }
  };

  private updateJobRole = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] updateJobRole initiated`);

    try {
      const jobData: OBJobOperationType = request.body;

      const translatedJob = mapJobOperationToDbRecord(jobData);

      const updatedJob = await jobService.updateJob(transactionId, translatedJob);

      response.status(HttpStatusCode.OK).json(updatedJob);
    } catch (updateErr) {
      logError(`[${transactionId}] [CONTROLLER] updateJobRole FAILED, reason: ${updateErr.message}`);

      next(updateErr);
    }
  };
}
