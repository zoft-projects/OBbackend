import { pingAuthMiddleware } from '@bayshore-healthcare/lib-ping-authentication-middleware';
import { NextFunction } from 'connect';
import express from 'express';
import { IAppConfig } from '../../config';
import { HttpStatusCode, UserLevelEnum } from '../../enums';
import { logError, logInfo, getLogger } from '../../log/util';
import { identityMiddleware, accessControlMiddlewareHOF } from '../../middlewares';
import { profileService } from '../../services';
import { BaseController } from '../base_controller';

const logger = getLogger();

const authenticationMiddleware = pingAuthMiddleware({ logger });

export class CompetenciesController extends BaseController {
  public basePath: string;
  public router: express.Router;

  constructor(appConfig: IAppConfig) {
    super(appConfig.envConfig);
    this.basePath = `${this.API_BASE_URL}/competencies`;
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
      this.asyncHandler(this.getEmployeeCompetencies),
    );
    this.router.post(
      `${this.basePath}`,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF, UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      this.asyncHandler(this.createEmployeeCompetency),
    );
    this.router.get(
      `${this.basePath}/all`,
      accessControlMiddlewareHOF([
        UserLevelEnum.FIELD_STAFF,
        UserLevelEnum.BRANCH_ADMIN,
        UserLevelEnum.ADMIN,
        UserLevelEnum.CONTROLLED_ADMIN,
        UserLevelEnum.SUPER_ADMIN,
      ]),
      this.asyncHandler(this.getCompetencies),
    );
    this.router.get(
      `${this.basePath}/all/categories`,
      accessControlMiddlewareHOF([
        UserLevelEnum.FIELD_STAFF,
        UserLevelEnum.BRANCH_ADMIN,
        UserLevelEnum.ADMIN,
        UserLevelEnum.CONTROLLED_ADMIN,
        UserLevelEnum.SUPER_ADMIN,
      ]),
      this.asyncHandler(this.getCompetenciesCategories),
    );
    this.router.put(
      `${this.basePath}/:competencyId`,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF, UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      this.asyncHandler(this.updateEmployeeCompetency),
    );
    this.router.delete(
      `${this.basePath}/:competencyId`,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF, UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      this.asyncHandler(this.deleteEmployeeCompetency),
    );
  }

  private getCompetenciesCategories = async (
    request: express.Request,
    response: express.Response,
    next: NextFunction,
  ) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] getCompetenciesCategories initiated`);

    try {
      const competenciesCategories = await profileService.getCompetenciesCategories(
        transactionId,
        `${request.query?.competencyType}`,
      );

      response.status(HttpStatusCode.OK).json({
        success: !!competenciesCategories,
        data: competenciesCategories ?? [],
      });
    } catch (err) {
      logError(`[${transactionId}] [CONTROLLER] getCompetenciesCategories FAILED, reason: ${err.message}`);

      next(err);
    }
  };

  private getCompetencies = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] getCompetencies initiated`);

    try {
      if (!request.query?.categoryId) {
        throw new Error('Missing query parameter categoryId');
      }

      if (!request.query?.jobRoles) {
        throw new Error('Missing query parameter jobRoles');
      }

      const competencies = await profileService.getCompetencies(
        transactionId,
        `${request.query?.categoryId}`,
        `${request.query?.jobRoles}`,
      );

      response.status(HttpStatusCode.OK).json({
        success: !!competencies,
        data: competencies ?? [],
      });
    } catch (err) {
      logError(`[${transactionId}] [CONTROLLER] getCompetencies FAILED, reason: ${err.message}`);

      next(err);
    }
  };

  private getEmployeeCompetencies = async (
    request: express.Request,
    response: express.Response,
    next: NextFunction,
  ) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] getEmployeeCompetencies initiated`);

    try {
      const { obUserPsId } = request.obUserIdentity;

      logInfo(`[${transactionId}] [CONTROLLER] getEmployeeCompetencies for obUserPsId: ${obUserPsId}`);
      const employeeCompetencies = await profileService.getEmployeeCompetencies(transactionId, {
        limit: request.query.limit ? parseInt(request.query?.limit?.toString()) : 20,
        employeePsId: obUserPsId,
        lastCursorId: request.query?.lastCursorId ? `${request.query?.lastCursorId}` : undefined,
      });

      response.status(HttpStatusCode.OK).json({
        success: !!employeeCompetencies,
        data: employeeCompetencies ?? [],
      });
    } catch (err) {
      logError(`[${transactionId}] [CONTROLLER] getEmployeeCompetencies FAILED, reason: ${err.message}`);

      next(err);
    }
  };

  private createEmployeeCompetency = async (
    request: express.Request,
    response: express.Response,
    next: NextFunction,
  ) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] createEmployeeCompetency initiated`);

    try {
      const { obUserPsId } = request.obUserIdentity;

      logInfo(`[${transactionId}] [CONTROLLER] createEmployeeCompetency for obUserPsId: ${obUserPsId}`);
      const result = await profileService.createEmployeeCompetency(transactionId, obUserPsId, request.body);

      response.status(HttpStatusCode.OK).json(result);
    } catch (err) {
      logError(`[${transactionId}] [CONTROLLER] createEmployeeCompetency FAILED, reason: ${err.message}`);

      next(err);
    }
  };

  private updateEmployeeCompetency = async (
    request: express.Request,
    response: express.Response,
    next: NextFunction,
  ) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] updateEmployeeCompetency initiated`);

    try {
      const { obUserPsId } = request.obUserIdentity;

      logInfo(`[${transactionId}] [CONTROLLER] updateEmployeeCompetency for obUserPsId: ${obUserPsId}`);
      const result = await profileService.updateEmployeeCompetency(transactionId, obUserPsId, request.body);

      response.status(HttpStatusCode.OK).json(result);
    } catch (err) {
      logError(`[${transactionId}] [CONTROLLER] updateEmployeeCompetency FAILED, reason: ${err.message}`);

      next(err);
    }
  };

  private deleteEmployeeCompetency = async (
    request: express.Request,
    response: express.Response,
    next: NextFunction,
  ) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] deleteEmployeeCompetency initiated`);

    try {
      const { obUserPsId } = request.obUserIdentity;

      logInfo(`[${transactionId}] [CONTROLLER] deleteEmployeeCompetency for obUserPsId: ${obUserPsId}`);
      const result = await profileService.deleteEmployeeCompetency(
        transactionId,
        obUserPsId,
        request.params.competencyId,
      );

      response.status(HttpStatusCode.OK).json(result);
    } catch (err) {
      logError(`[${transactionId}] [CONTROLLER] deleteEmployeeCompetency FAILED, reason: ${err.message}`);

      next(err);
    }
  };
}
