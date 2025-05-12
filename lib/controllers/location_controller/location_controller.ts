import { HttpStatusCode } from '@bayshore-healthcare/lib-error-middleware';
import { pingAuthMiddleware } from '@bayshore-healthcare/lib-ping-authentication-middleware';
import express, { NextFunction } from 'express';
import { IAppConfig } from '../../config';
import { getLogger, logError, logInfo } from '../../log/util';
import { locationService } from '../../services';
import { HttpPOSTCreateOBBranch } from '../../types';
import { mapBranchApiRequestToOperation } from '../../utils';
import { BaseController } from '../base_controller';

const logger = getLogger();

const authenticationMiddleware = pingAuthMiddleware({ logger });

export class LocationController extends BaseController {
  public basePath: string;
  public router: express.Router;

  constructor(appConfig: IAppConfig) {
    super(appConfig.envConfig);
    this.basePath = `${this.API_BASE_URL}/location`;
    this.router = express.Router();
    this.router.use(this.basePath, authenticationMiddleware);
    this.initializeRoutes();
  }

  public getBasePath(): string {
    return this.basePath;
  }

  public initializeRoutes(): void {
    this.router.get(`${this.basePath}/branches`, this.asyncHandler(this.getBranches.bind(this)));
    this.router.post(`${this.basePath}/branches`, this.asyncHandler(this.createBranch.bind(this)));
    this.router.put(`${this.basePath}/branches/:branchId`, this.asyncHandler(this.updateBranch.bind(this)));
    this.router.delete(`${this.basePath}/branches/:branchId`, this.asyncHandler(this.removeBranch.bind(this)));
  }

  private getBranches = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] Get all branch initiated`);

    try {
      const branchesWithDivisions = await locationService.getAllBranchesWithDivisions(transactionId);

      logInfo(
        `[${transactionId}] [CONTROLLER] Get all branch successful, total branches: ${branchesWithDivisions.length}`,
      );

      response.status(HttpStatusCode.OK).json({
        success: true,
        branches: branchesWithDivisions,
      });
    } catch (getErr) {
      logError(`[${transactionId}] [CONTROLLER] Get all branch failed`);

      next(getErr);
    }
  };

  private createBranch = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] Create branch initiated`);

    try {
      const branch: HttpPOSTCreateOBBranch = request.body;

      const translatedBranchDetails = mapBranchApiRequestToOperation(branch);

      const { successful, failed } = await locationService.createOrUpdateMultipleObBranchDivisions(transactionId, [
        translatedBranchDetails,
      ]);

      const [createdBranchId] = successful;
      const [failedBranchId] = failed;

      if (!createdBranchId && failedBranchId) {
        throw new Error(`Unable to create the branch ${failedBranchId}`);
      }

      response.status(HttpStatusCode.OK).json({
        success: true,
        message: `Successfully created the branch ${createdBranchId}`,
      });
    } catch (err) {
      logError(`[${transactionId}] [CONTROLLER] createBranch endpoint failed with error: ${err.message}`);

      next(err);
    }
  };

  private updateBranch = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] Update branch initiated`);

    try {
      const branch: HttpPOSTCreateOBBranch = request.body;

      const translatedBranchDetails = mapBranchApiRequestToOperation(branch);

      const { successful, failed } = await locationService.createOrUpdateMultipleObBranchDivisions(transactionId, [
        translatedBranchDetails,
      ]);

      const [updatedBranchId] = successful;
      const [failedBranchId] = failed;

      if (!updatedBranchId && failedBranchId) {
        throw new Error(`Unable to update the branch ${failedBranchId}`);
      }

      response.status(HttpStatusCode.OK).json({
        success: true,
        message: `Successfully update the branch ${updatedBranchId}`,
      });
    } catch (err) {
      logError(`[${transactionId}] [CONTROLLER] updateBranch endpoint failed with error: ${err.message}`);

      next(err);
    }
  };

  private removeBranch = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] Remove branch initiated`);

    const { branchId } = request.params;

    try {
      const removedBranchId = await locationService.removeBranchByBranchId(transactionId, branchId);

      logInfo(`[${transactionId}] [CONTROLLER] Remove branch successful for ${removedBranchId}`);

      response.status(HttpStatusCode.OK).json({
        success: true,
        message: `Branch ${removedBranchId} removed successfully`,
      });
    } catch (removeErr) {
      logError(`[${transactionId}] [CONTROLLER] Remove branch failed with error: ${removeErr.message}`);

      next(removeErr);
    }
  };
}
