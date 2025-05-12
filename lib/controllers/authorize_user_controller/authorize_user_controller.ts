import { pingAuthMiddleware } from '@bayshore-healthcare/lib-ping-authentication-middleware';
import axios from 'axios';
import config from 'config';
import express, { NextFunction } from 'express';
import jwtDecode from 'jwt-decode';
import { IAppConfig } from '../../config';
import { HttpStatusCode, VendorExternalEnum, UserLevelEnum } from '../../enums';
import { AuthError } from '../../errors/auth_error';
import { ValidationError } from '../../errors/validation_error';
import { logError, logInfo, getLogger } from '../../log/util';
import { identityMiddleware, accessControlMiddlewareHOF } from '../../middlewares';
import { chatService, chatV2Service, userService, onboardUserService } from '../../services';
import {
  EmployeeInPsUpsertOperationType,
  JSONLikeType,
  OBProfileUpsertOperationType,
  OBUserSchemaType,
  UserAuthenticatedPayloadType,
} from '../../types';
import { namePrimaryId, userPsId, createNanoId, getEffectiveBranchIds } from '../../utils';
import { BaseController } from '../base_controller';

const pingUserAuthorizerConfig: {
  endpoint: string;
  clientId: string;
} = config.get('Services.pingUserAuthorizer');

const logger = getLogger();

const authenticationMiddleware = pingAuthMiddleware({ logger });

export class AuthorizeUserController extends BaseController {
  public basePath: string;
  public router: express.Router;

  constructor(appConfig: IAppConfig) {
    super(appConfig.envConfig);
    this.basePath = `${this.API_BASE_URL}/authorize`;
    this.router = express.Router();
    this.initializeRoutes();
  }

  public getBasePath(): string {
    return this.basePath;
  }

  public initializeRoutes(): void {
    // POST /authorize
    this.router.post(this.basePath, this.asyncHandler(this.authorizeUser));
    // POST /authorize/renew
    this.router.post(`${this.basePath}/renew`, this.asyncHandler(this.reauthorizeUser));
    // GET /authorize/health
    this.router.get(
      `${this.basePath}/health`,
      authenticationMiddleware,
      identityMiddleware,
      this.asyncHandler(this.authorizationCheck),
    );
    this.router.post(
      `${this.basePath}/logout`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([
        UserLevelEnum.FIELD_STAFF,
        UserLevelEnum.BRANCH_ADMIN,
        UserLevelEnum.ADMIN,
        UserLevelEnum.CONTROLLED_ADMIN,
        UserLevelEnum.SUPER_ADMIN,
      ]),
      this.asyncHandler(this.logoutUser),
    );
  }

  private authorizationCheck = async (request: express.Request, response: express.Response) => {
    const transactionId = request.txId;

    const { employeePsId } = request.employeePingIdentity;

    logInfo(`[${transactionId}] [CONTROLLER] Authorization check for user employeePsId: ${employeePsId}`);

    const { deviceType, appVersion }: { deviceType?: string; appVersion?: string } = request.query;

    if (deviceType) {
      logInfo(
        `[${transactionId}] [CONTROLLER] Authorization check for employeePsId:${employeePsId}, deviceType: ${deviceType}`,
      );
    }

    if (appVersion) {
      logInfo(
        `[${transactionId}] [CONTROLLER] Authorization check for employeePsId:${employeePsId}, appVersion: ${appVersion}`,
      );
    }

    logInfo(`[${transactionId}] [CONTROLLER] Authorization check successful for employeePsId: ${employeePsId}`);

    response.status(HttpStatusCode.OK).send('ok');
  };

  // Authorize using  access token
  private authorizeUser = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] Authorize user, request body: ${JSON.stringify(request.body)}`);

    let responded = false;
    const {
      code,
      state,
      deviceToken: currentDeviceId,
      deviceOS,
      username: userIdentifier,
    }: {
      clientId?: string;
      code?: string;
      state?: string;
      deviceToken?: string;
      deviceOS?: string;
      username?: string;
    } = request.body;

    try {
      if (!code && !state) {
        throw new ValidationError('Required fields are missing');
      }

      const postBody = {
        code,
        state,
        clientId: pingUserAuthorizerConfig.clientId,
      };

      const authResponse = await axios.post(`${pingUserAuthorizerConfig.endpoint}/ping-fed/v1/access-token`, postBody);
      const vendorConfigs = await onboardUserService.getAuthorizedVendors(transactionId).catch((vendorConfigErr) => {
        logError(
          `[${transactionId}] [CONTROLLER] Authorize vendor config error - silent fail, reason: ${vendorConfigErr.message}`,
        );

        return {};
      });

      const {
        access_token: accessToken,
        id_token: idToken,
        expires_in: expiresIn,
        token_type: tokenType,
        refresh_token: refreshToken,
      } = authResponse.data;

      const { employeeID: employeePsId, Username: userEmail }: { employeeID?: string; Username: string } =
        jwtDecode(accessToken);

      logInfo(
        `[${transactionId}] [CONTROLLER] Authorize User, decoded JWT token: ${JSON.stringify({
          employeePsId,
          userEmail,
        })}`,
      );

      const primaryUserId = namePrimaryId(userPsId(employeePsId, userEmail));

      const qbConfig: JSONLikeType = vendorConfigs[VendorExternalEnum.Quickblox] ?? null;
      const mixpanelConfig: JSONLikeType = vendorConfigs[VendorExternalEnum.Mixpanel] ?? null;
      const firebaseWebConfig: JSONLikeType = vendorConfigs[VendorExternalEnum.Firebase] ?? null;

      const mappedPayload: UserAuthenticatedPayloadType = {
        accessToken,
        idToken,
        expiresIn,
        tokenType,
        refreshToken,
        primaryUserId,
        hasAccess: true, // TODO check db to set this value
        identityToken: createNanoId(24),
        vendorIdentities: [
          {
            vendorName: VendorExternalEnum.Quickblox,
            vendorValues: qbConfig,
          },
          {
            vendorName: VendorExternalEnum.Mixpanel,
            vendorValues: mixpanelConfig,
          },
          {
            vendorName: VendorExternalEnum.Firebase,
            vendorValues: firebaseWebConfig,
          },
        ],
      };

      response.status(HttpStatusCode.OK).json(mappedPayload);
      responded = true;

      logInfo(`[${transactionId}] [CONTROLLER] Authorize User, sending response after user authorization.`);

      const updateUserInfo: Partial<OBProfileUpsertOperationType & EmployeeInPsUpsertOperationType> = {
        psId: userPsId(employeePsId, userEmail),
        lastLoggedAt: new Date(),
        lastVisitedAt: new Date(),
      };

      logInfo(`[${transactionId}] [CONTROLLER] Authorize User, User PsId: ${updateUserInfo.psId}`);

      const currentUserInfo: OBUserSchemaType = await userService.getObUsersByPsId(
        transactionId,
        userPsId(employeePsId, userEmail),
      );

      if (!currentUserInfo) {
        logInfo(
          `[${transactionId}] [CONTROLLER] Skipped updating user login info: employee not found in the database.`,
        );

        return;
      }

      const { deviceTokens = [], firstLoggedAt } = currentUserInfo;

      if (!firstLoggedAt) {
        updateUserInfo.firstLoggedAt = new Date();
      }

      if (currentDeviceId) {
        const matchedToken = deviceTokens.find(({ deviceId }) => deviceId === currentDeviceId);

        const newDeviceTokenEntry: { deviceId: string; deviceOS?: string; hasEnabled: boolean } = {
          deviceId: currentDeviceId,
          hasEnabled: true,
        };

        if (deviceOS) {
          newDeviceTokenEntry.deviceOS = deviceOS;
        }

        if (!matchedToken) {
          // Keep only max of 2 tokens in the system per user
          updateUserInfo.deviceTokens = [newDeviceTokenEntry, ...deviceTokens].slice(0, 2);
        }
      }

      await userService.updateUserByPsId(transactionId, updateUserInfo).catch((updateErr) => {
        logError(
          `[${transactionId}] [CONTROLLER] Employee activity update FAILED, employeePsId: ${userPsId(
            employeePsId,
            userEmail,
          )} reason: ${updateErr.message}`,
        );
      });

      const [primaryBranchId] = getEffectiveBranchIds(
        currentUserInfo.branchAccess.overriddenBranchIds,
        currentUserInfo.branchAccess.selectedBranchIds,
      );

      await chatV2Service.syncChatUserAccessForBranch(transactionId, primaryBranchId);

      await chatV2Service
        .syncBranchChatAbility(transactionId, currentUserInfo.employeePsId, primaryBranchId)
        .catch((syncErr) => {
          logError(
            `[${transactionId}] [CONTROLLER] Sync chat v2 group for user FAILED, psId: ${currentUserInfo.employeePsId} reason: ${syncErr.message}`,
          );
        });

      if (!(await chatV2Service.isEligibleForNewChatVendor(transactionId, currentUserInfo.employeePsId))) {
        await chatService.syncChatGroupForUser(transactionId, userPsId(employeePsId, userEmail)).catch((updateErr) => {
          logError(
            `[${transactionId}] [CONTROLLER] Sync chat group for user FAILED, employeePsId: ${userPsId(
              employeePsId,
              userEmail,
            )} reason: ${updateErr.message}`,
          );
        });
      }

      logInfo(
        `[${transactionId}] [CONTROLLER] Employee activity update SUCCESSFUL employeePsId:${userPsId(
          employeePsId,
          userEmail,
        )}`,
      );
    } catch (authErr) {
      logError(
        `[${transactionId}] [CONTROLLER] Authorize user failed for ${userIdentifier || ''}, reason: ${authErr.message}`,
      );

      if (!responded) {
        next(new AuthError('Sorry something went wrong during the authorization. Please retry!'));
      }
    }
  };

  // Renew the access token using the refresh token
  private reauthorizeUser = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] Reauthorize user`);

    const { refreshToken }: { refreshToken?: string; clientId?: string } = request.body;

    try {
      if (!refreshToken) {
        throw new ValidationError('Required fields are missing');
      }
      const postBody = {
        refreshToken,
        clientId: pingUserAuthorizerConfig.clientId,
      };

      const renewResponse = await axios.post(`${pingUserAuthorizerConfig.endpoint}/ping-fed/v1/renew-token`, postBody);
      const vendorConfigs = await onboardUserService.getAuthorizedVendors(transactionId).catch((vendorConfigErr) => {
        logError(
          `[${transactionId}] [CONTROLLER] Reauthorize vendor config error - silent fail, reason: ${vendorConfigErr.message}`,
        );

        return {};
      });

      const { access_token: accessToken, expires_in: expiresIn, token_type: tokenType } = renewResponse.data;
      const { employeeID: employeePsId, Username: userEmail }: { employeeID?: string; Username: string } =
        jwtDecode(accessToken);

      const primaryUserId = namePrimaryId(userPsId(employeePsId, userEmail));

      const qbConfig: JSONLikeType = vendorConfigs[VendorExternalEnum.Quickblox] ?? null;
      const mixpanelConfig: JSONLikeType = vendorConfigs[VendorExternalEnum.Mixpanel] ?? null;

      const mappedRenewedPayload: UserAuthenticatedPayloadType = {
        accessToken,
        expiresIn,
        tokenType,
        primaryUserId,
        hasAccess: true, // TODO check db to set this value
        vendorIdentities: [
          {
            vendorName: VendorExternalEnum.Quickblox,
            vendorValues: qbConfig,
          },
          {
            vendorName: VendorExternalEnum.Mixpanel,
            vendorValues: mixpanelConfig,
          },
        ],
      };

      response.status(HttpStatusCode.OK).json(mappedRenewedPayload);

      const currentUserInfo: OBUserSchemaType = await userService.getObUsersByPsId(
        transactionId,
        userPsId(employeePsId, userEmail),
      );

      const [primaryBranchId] = getEffectiveBranchIds(
        currentUserInfo.branchAccess.overriddenBranchIds,
        currentUserInfo.branchAccess.selectedBranchIds,
      );

      await chatV2Service
        .syncBranchChatAbility(transactionId, currentUserInfo.employeePsId, primaryBranchId)
        .catch((syncErr) => {
          logError(
            `[${transactionId}] [CONTROLLER] Sync chat v2 group for user FAILED, psId: ${currentUserInfo.employeePsId} reason: ${syncErr.message}`,
          );
        });
    } catch (authErr) {
      logError(`[${transactionId}] [CONTROLLER] Reauthorize user failed, reason: ${authErr.message}`);

      next(authErr);
    }
  };

  private logoutUser = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    const { obUserPsId } = request.obUserIdentity;

    logInfo(`[${transactionId}] [CONTROLLER] Logout user psId: ${obUserPsId}`);

    try {
      const logoutResponse = await axios.post(
        `${pingUserAuthorizerConfig.endpoint}/ping-fed/v1/logout`,
        {
          clientId: pingUserAuthorizerConfig.clientId,
        },
        {
          headers: {
            Authorization: `${request.headers.authorization}`,
          },
        },
      );

      if (logoutResponse.data?.id) {
        logInfo(`[${transactionId}] [CONTROLLER] Logout successful for psId: ${obUserPsId}`);
      }

      response.status(HttpStatusCode.OK).json(logoutResponse.data);
    } catch (logoutError) {
      logError(`[${transactionId}] [CONTROLLER] Logout user for psId: ${obUserPsId}, reason: ${logoutError.message}`);

      next(logError);
    }
  };
}
