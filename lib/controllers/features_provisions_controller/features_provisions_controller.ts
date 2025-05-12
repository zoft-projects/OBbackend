import { HttpStatusCode } from '@bayshore-healthcare/lib-error-middleware';
import { pingAuthMiddleware } from '@bayshore-healthcare/lib-ping-authentication-middleware';
import config from 'config';
import express, { NextFunction } from 'express';
import { IAppConfig } from '../../config';
import { BranchFeaturesProvisionEnum, UserLevelEnum } from '../../enums';
import { getLogger, logError, logInfo } from '../../log/util';
import { identityMiddleware, accessControlMiddlewareHOF } from '../../middlewares';
import { featureProvisioningService, mailService } from '../../services';
import { HttpPostUpdateFeatureProvisions, JSONLikeType, OBFeatureProvisionSchemaType } from '../../types';
import { mapAccessLevelToName } from '../../utils';
import { BaseController } from '../base_controller';

const logger = getLogger();

const authenticationMiddleware = pingAuthMiddleware({ logger });
const mailboxFeatureConfig: { supportEnabled: boolean } = config.get('Features.mailbox');

export class FeatureProvisionsController extends BaseController {
  public basePath: string;
  public router: express.Router;

  constructor(appConfig: IAppConfig) {
    super(appConfig.envConfig);
    this.basePath = `${this.API_BASE_URL}/features`;
    this.router = express.Router();
    this.initializeRoutes();
  }

  public getBasePath(): string {
    return this.basePath;
  }

  public initializeRoutes(): void {
    this.router.get(
      `${this.basePath}/admin/provisions`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([UserLevelEnum.SUPER_ADMIN]),
      this.asyncHandler(this.getFeatureProvisions),
    );
    this.router.post(
      `${this.basePath}/admin/provisions`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([UserLevelEnum.SUPER_ADMIN]),
      this.asyncHandler(this.updateFeatureProvisions),
    );
  }

  private getFeatureProvisions = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] getFeatureProvisions initiated`);

    try {
      const { accessLvl } = request.obUserIdentity;

      const accessLevelName = mapAccessLevelToName(accessLvl);

      if (![UserLevelEnum.SUPER_ADMIN, UserLevelEnum.ADMIN].includes(accessLevelName)) {
        throw new Error("You don't have the required access level to perform this action.");
      }

      const featureProvisions = await featureProvisioningService.getFeatureProvisions(transactionId).catch(); // Silent fail

      if (!featureProvisions) {
        throw new Error('No existing provisions are available.');
      }

      // TODO The response structure needs to be simplified. Currently to support existing ui we keep the same
      response.status(HttpStatusCode.OK).json(featureProvisions);
    } catch (fetchErr) {
      logError(`[${transactionId}] [CONTROLLER] getFeatureProvisions FAILED, reason: ${fetchErr.message}`);

      next(fetchErr);
    }
  };

  private updateFeatureProvisions = async (
    request: express.Request,
    response: express.Response,
    next: NextFunction,
  ) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] updateFeatureProvisions initiated`);

    try {
      const { accessLvl } = request.obUserIdentity;
      const accessLevelName = mapAccessLevelToName(accessLvl);

      if (![UserLevelEnum.SUPER_ADMIN, UserLevelEnum.ADMIN].includes(accessLevelName)) {
        throw new Error("You don't have the required access level to perform this action.");
      }

      const featureProvisionData: HttpPostUpdateFeatureProvisions = request.body;

      const previousProvisions = await featureProvisioningService.getFeatureProvisions(transactionId);

      const hasMailboxChanges = Object.entries(featureProvisionData.branchOverrides).some(([branchId, provisions]) => {
        const previousBranchProvisions = previousProvisions.branchOverrides?.[branchId] || {};
        const currentEmailFeature = provisions[BranchFeaturesProvisionEnum.EmailFeature];
        const previousEmailFeature = previousBranchProvisions[BranchFeaturesProvisionEnum.EmailFeature];

        return (
          previousEmailFeature !== currentEmailFeature ||
          (previousEmailFeature && !(BranchFeaturesProvisionEnum.EmailFeature in (provisions as JSONLikeType)))
        );
      });

      const isUpdated = await featureProvisioningService.updateFeatureProvisions(transactionId, {
        defaultForBranches: featureProvisionData.defaultForBranches,
        branchOverrides: featureProvisionData.branchOverrides,
      } as OBFeatureProvisionSchemaType);

      logInfo(`[${transactionId}] [CONTROLLER] updateFeatureProvisions - Remote config fetched successfully`);

      logInfo(
        `[${transactionId}] [CONTROLLER] Initiating user preferences for Mail Inbox: ${mailboxFeatureConfig.supportEnabled}, hasMailboxChanges: ${hasMailboxChanges}`,
      );

      if (mailboxFeatureConfig.supportEnabled && hasMailboxChanges) {
        logInfo(`[${transactionId}] [CONTROLLER] Updating user preferences for Mail Inbox initiated`);

        const provisioningPromises = Object.entries(featureProvisionData.branchOverrides)
          .filter(([branchId, provisions]) => {
            const previousBranchProvisions = (previousProvisions.branchOverrides?.[branchId] as JSONLikeType) || {};
            const emailFeatureKey = BranchFeaturesProvisionEnum.EmailFeature;

            return emailFeatureKey in previousBranchProvisions || emailFeatureKey in (provisions as JSONLikeType);
          })
          .map(([branchId, provisions]) => {
            const previousBranchProvisions = (previousProvisions.branchOverrides?.[branchId] as JSONLikeType) || {};
            const emailFeatureKey = BranchFeaturesProvisionEnum.EmailFeature;

            const isSupported =
              !(emailFeatureKey in (provisions as JSONLikeType)) && emailFeatureKey in previousBranchProvisions
                ? false
                : (provisions as JSONLikeType)[emailFeatureKey] === true;

            return mailService.syncMailboxForBranchId(transactionId, branchId, isSupported);
          });

        await Promise.allSettled(provisioningPromises);

        logInfo(`[${transactionId}] [CONTROLLER] Updating user preferences for Mail Inbox completed`);
      }

      response.status(HttpStatusCode.OK).json({
        success: isUpdated,
        message: isUpdated
          ? 'Branch feature provisioning updated successfully!'
          : 'Ignoring since no significant changes in the provisions!',
      });
    } catch (updateErr) {
      logError(`[${transactionId}] [CONTROLLER] updateFeatureProvisions FAILED, reason: ${updateErr.message}`);
      next(updateErr);
    }
  };
}
