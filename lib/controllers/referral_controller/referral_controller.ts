import { HttpStatusCode } from '@bayshore-healthcare/lib-error-middleware';
import { pingAuthMiddleware } from '@bayshore-healthcare/lib-ping-authentication-middleware';
import express, { NextFunction } from 'express';
import { FilterQuery } from 'mongoose';
import { IAppConfig } from '../../config';
import { AnonymizedTypeEnum, UserLevelEnum } from '../../enums';
import { getLogger, logError, logInfo } from '../../log/util';
import { identityMiddleware, accessControlMiddlewareHOF } from '../../middlewares';
import { anonymizedInfoService, locationService } from '../../services';
import { HttpPOSTCreateOBReferral, OBAnonymizedInfoCreateOperationType, OBAnonymizedInfoSchemaType } from '../../types';
import { mapAnonymizedInfoToReferralPayload } from '../../utils';
import { BaseController } from '../base_controller';

const logger = getLogger();

const authenticationMiddleware = pingAuthMiddleware({ logger });

export class ReferralController extends BaseController {
  public basePath: string;
  public router: express.Router;

  constructor(appConfig: IAppConfig) {
    super(appConfig.envConfig);
    this.basePath = `${this.API_BASE_URL}/referrals`;
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
      this.createReferral,
    );
    this.router.get(
      `${this.basePath}`,
      accessControlMiddlewareHOF([
        UserLevelEnum.BRANCH_ADMIN,
        UserLevelEnum.ADMIN,
        UserLevelEnum.CONTROLLED_ADMIN,
        UserLevelEnum.SUPER_ADMIN,
      ]),
      this.listReferrals,
    );
  }

  private createReferral = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] createReferral initiated`);

    try {
      const { referralName, referralEmail, referredByPsId, createdAt, ...payload }: HttpPOSTCreateOBReferral =
        request.body;

      const { obUserPsId, displayName, branchIds } = request.obUserIdentity;

      // TODO: Remove after migration
      payload.referredByName = payload.referredByName ?? displayName;
      payload.referredByBranchIds = payload.referredByBranchIds ?? branchIds;

      if (!referralEmail || !referralName) {
        throw new Error('Missing required fields!');
      }

      const data: OBAnonymizedInfoCreateOperationType = {
        identifier: referredByPsId ? `${referredByPsId}_${referralEmail}` : `${obUserPsId}_${referralEmail}`,
        infoKey: AnonymizedTypeEnum.FriendReferral,
        infoValue: `${referralName}|${referralEmail}`,
        infoType: 'referral',
        payload,
        createdAt,
      };

      const previousAnonEntry = await anonymizedInfoService.getPreviousAnonEntryByIdAndKeyType(transactionId, {
        identifier: referredByPsId ? `${referredByPsId}_${referralEmail}` : `${obUserPsId}_${referralEmail}`,
        infoKey: AnonymizedTypeEnum.FriendReferral,
        infoType: 'referral',
      });

      let referral: { identifier: string };
      if (previousAnonEntry) {
        logInfo(`[${transactionId}] [CONTROLLER] createReferral - previous entry found`);

        referral = await anonymizedInfoService.updateOBAnonymizedInfo(transactionId, data);
      } else {
        referral = await anonymizedInfoService.createOBAnonymizedInfo(transactionId, data);
      }

      logInfo(`[${transactionId}] [CONTROLLER] createReferral COMPLETED`);

      response.status(HttpStatusCode.OK).json({
        success: true,
        data: referral,
      });
    } catch (err) {
      logError(`[${transactionId}] [CONTROLLER] createReferral endpoint failed with error: ${err.message}`);

      next(err);
    }
  };

  private listReferrals = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] listReferrals initiated`);

    try {
      const {
        skip,
        limit,
        search,
        referralType,
      }: {
        skip?: string;
        limit?: string;
        search?: string;
        referralType?: AnonymizedTypeEnum;
      } = request.query;

      logInfo(
        `[${transactionId}] [CONTROLLER] listReferrals query requested for referral type: ${referralType}, limit: ${
          +limit || 10
        }, skip: ${+skip || 0}`,
      );

      let filter: FilterQuery<OBAnonymizedInfoSchemaType> = { infoKey: referralType };

      const { branchIds: userBranchIds } = request.obUserIdentity;

      if (userBranchIds && !userBranchIds.includes('*')) {
        filter = { ...filter, 'payload.referredByBranchIds': { $in: userBranchIds } };
      }

      const referrals = await anonymizedInfoService.getReferralsByFilter(transactionId, filter, {
        skip: +skip || 0,
        limit: +limit || 10,
        search,
      });

      const branchList = await locationService.getAllBranchesWithDivisions(transactionId);

      logInfo(`[${transactionId}] [CONTROLLER] listReferrals COMPLETED`);

      const mappedReferrals = referrals.map((referral) =>
        mapAnonymizedInfoToReferralPayload(referral, {
          branchDivisions: branchList,
        }),
      );

      response.status(HttpStatusCode.OK).json({
        success: true,
        data: mappedReferrals,
      });
    } catch (listErr) {
      logError(`[${transactionId}] [CONTROLLER] listReferrals FAILED, reason: ${listErr.message}`);

      next(listErr);
    }
  };
}
