import { HttpStatusCode } from '@bayshore-healthcare/lib-error-middleware';
import { pingAuthMiddleware } from '@bayshore-healthcare/lib-ping-authentication-middleware';
import config from 'config';
import express, { NextFunction } from 'express';
import multer from 'multer';
import { IAppConfig } from '../../config';
import {
  ActiveStateEnum,
  UserLevelEnum,
  ChatGroupEnum,
  JobCategoryEnum,
  ScreenEnum,
  MultipartUploadPhaseEnum,
  BranchFeaturesProvisionEnum,
  UserAccessModeEnum,
} from '../../enums';
import { logError, logInfo, getLogger, logWarn } from '../../log/util';
import { identityMiddleware, onebayshoreInternalApiMiddleware, accessControlMiddlewareHOF } from '../../middlewares';
import {
  chatService,
  notificationService,
  featureProvisioningService,
  chatV2Service,
  pushNotificationService,
  userService,
} from '../../services';
import {
  HttpPOSTCreateChatV2GroupInputType,
  ChatV2AttachmentPayloadType,
  HttpPostChatAttachmentInputType,
  ChatV2ContactPayloadType,
  ChatV2GroupPayloadType,
  HttpPUTUpdateChatV2GroupInputType,
  ChatV2GroupDetailsPayloadType,
  HttpChatV2ActionInputType,
} from '../../types';
import {
  getEffectiveBranchIds,
  mapAccessLevelToName,
  mapDBChatV2GroupDetailsToApiPayload,
  mapDBChatV2GroupToApiPayload,
  prefixTopicNameForGroupAndJobLevel,
} from '../../utils';
import { BaseController } from '../base_controller';

const upload = multer({ storage: multer.memoryStorage() });
const logger = getLogger();

const authenticationMiddleware = pingAuthMiddleware({ logger });

const chatConfig: {
  notifyUsers: boolean;
  notifiableAdminLevels: number[];
  acsEndpoint: string;
} = config.get('Features.chat');

export class ChatController extends BaseController {
  public basePath: string;
  public router: express.Router;

  constructor(appConfig: IAppConfig) {
    super(appConfig.envConfig);
    this.basePath = `${this.API_BASE_URL}/chats`;
    this.router = express.Router();
    this.initializeRoutes();
  }

  public getBasePath(): string {
    return this.basePath;
  }

  public initializeRoutes(): void {
    this.router.post(`${this.basePath}`, onebayshoreInternalApiMiddleware, this.createChatGroups);
    this.router.post(`${this.basePath}/sync`, onebayshoreInternalApiMiddleware, this.syncChatGroups);
    this.router.post(
      `${this.basePath}/action`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF, UserLevelEnum.BRANCH_ADMIN]),
      this.chatActionTriggered,
    );
    this.router.get(
      `${this.basePath}/connection`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF, UserLevelEnum.BRANCH_ADMIN]),
      this.asyncHandler(this.initializeConnection.bind(this)),
    );
    this.router.delete(`${this.basePath}`, onebayshoreInternalApiMiddleware, this.deleteChatGroup);

    // Chat V2 routes
    this.router.get(
      `${this.basePath}/contacts`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([UserLevelEnum.BRANCH_ADMIN]),
      this.asyncHandler(this.getChatContacts.bind(this)),
    );
    this.router.get(
      `${this.basePath}/groups/:groupId/members`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([UserLevelEnum.BRANCH_ADMIN]),
      this.asyncHandler(this.getGroupMemberIds.bind(this)),
    );
    this.router.get(
      `${this.basePath}/groups`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF, UserLevelEnum.BRANCH_ADMIN]),
      this.getChatGroups,
    );
    this.router.get(
      `${this.basePath}/groups/:groupId`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF, UserLevelEnum.BRANCH_ADMIN]),
      this.getChatGroupDetails,
    );
    this.router.post(
      `${this.basePath}/groups`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([UserLevelEnum.BRANCH_ADMIN]),
      this.createChatV2Groups,
    );
    this.router.put(
      `${this.basePath}/groups/:groupId`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([UserLevelEnum.BRANCH_ADMIN]),
      this.updateChatV2Groups,
    );
    this.router.delete(
      `${this.basePath}/groups/:groupId`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([UserLevelEnum.BRANCH_ADMIN]),
      this.removeChatV2Group,
    );
    this.router.get(
      `${this.basePath}/attachments`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF, UserLevelEnum.BRANCH_ADMIN]),
      this.asyncHandler(this.getAttachment.bind(this)),
    );
    this.router.post(
      `${this.basePath}/attachments`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF, UserLevelEnum.BRANCH_ADMIN]),
      upload.single('file'),
      this.asyncHandler(this.attachFile.bind(this)),
    );
  }

  private initializeConnection = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    const { obUserPsId } = request.obUserIdentity;

    logInfo(`[${transactionId}] [CONTROLLER] initializeConnection initiated for psId: ${obUserPsId}`);

    try {
      const { refresh }: { refresh?: string } = request.query;
      const acsEndpoint = chatConfig.acsEndpoint;

      const forceRefresh = refresh === 'true';

      if (forceRefresh) {
        logWarn(`[${transactionId}] [CONTROLLER] initializeConnection REFRESH TOKEN REQUESTED for psId: ${obUserPsId}`);
      }

      const { token: userAcsToken, expiresOn } = await chatV2Service.fetchChatUserToken(
        transactionId,
        obUserPsId,
        forceRefresh,
      );

      response.json({
        acsEndpoint,
        userAcsToken,
        expiresOn,
      });
    } catch (connectErr) {
      logError(
        `[${transactionId}] [CONTROLLER] initializeConnection FAILED for psId: ${obUserPsId}, reason: ${connectErr.message}`,
      );

      next(connectErr);
    }
  };

  private createChatV2Groups = async (
    request: express.Request,
    response: express.Response,
    next: NextFunction,
  ): Promise<void> => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] createChatV2Groups initiated`);

    try {
      // TODO branchId should be checked if its part of the current users branchIds list
      const body: HttpPOSTCreateChatV2GroupInputType = request.body;

      logInfo(
        `[${transactionId}] [CONTROLLER] createChatV2Groups: creating chat group for branchId: ${body.branchId}, groupName: ${body.groupName}`,
      );

      const { branchId, groupName, groupType } = body;

      if (!branchId || !groupName || !groupType || !(groupType in ChatGroupEnum)) {
        logError(
          `[${transactionId}] [CONTROLLER] createChatV2Groups: Required fields are missing!, body: ${JSON.stringify(
            body,
          )}`,
        );
        throw new Error('Required fields are missing!');
      }

      if (!Array.isArray(body.groupUserPsIds) || body.groupUserPsIds.length === 0) {
        logError(
          `[${transactionId}] [CONTROLLER] createChatV2Groups: groupUserPsIds must be an array, groupUserPsIds: ${body.groupUserPsIds}`,
        );

        throw new Error('groupUserPsIds must be an array');
      }

      const createResult = await chatV2Service.createChatGroupForBranch(transactionId, branchId, body);

      logInfo(
        `[${transactionId}] [CONTROLLER] createChatV2Groups SUCCESSFUL: groupId: ${JSON.stringify(createResult)}`,
      );

      response.status(HttpStatusCode.OK).json(createResult);
    } catch (createErr) {
      logError(`[${transactionId}] [CONTROLLER] createChatGroupsV2 FAILED, reason: ${createErr.message}`);

      next(createErr);
    }
  };

  private updateChatV2Groups = async (
    request: express.Request,
    response: express.Response,
    next: NextFunction,
  ): Promise<void> => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] updateChatV2Groups initiated`);

    try {
      const body: HttpPUTUpdateChatV2GroupInputType = request.body;
      const { groupId } = request.params;

      if (!groupId) {
        logError(`[${transactionId}] [CONTROLLER] updateChatV2Groups: groupId is missing!`);
        response.status(HttpStatusCode.BAD_REQUEST).json({ message: 'GroupId is missing!' });

        return;
      }

      const updateResult = await chatV2Service.updateChatGroupWithParticipants(transactionId, groupId, body);

      logInfo(`[${transactionId}] [CONTROLLER] updateChatV2Groups: Successfully updated groupId: ${groupId}`);

      response.status(HttpStatusCode.OK).json(mapDBChatV2GroupToApiPayload(updateResult));
    } catch (updateErr) {
      logError(`[${transactionId}] [CONTROLLER] updateChatV2Groups FAILED, reason: ${updateErr.message}`);
      next(updateErr);
    }
  };

  private createChatGroups = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] createChatGroups initiated`);

    try {
      const { branchId } = request.body;

      await chatService.createMultipleGroups(transactionId, branchId);

      response.status(HttpStatusCode.OK).json({
        status: true,
      });
    } catch (createErr) {
      logError(`[${transactionId}] [CONTROLLER] createChatGroups FAILED, reason: ${createErr.message}`);

      next(createErr);
    }
  };

  private getChatGroups = async (
    request: express.Request,
    response: express.Response<ChatV2GroupPayloadType[]>,
    next: NextFunction,
  ) => {
    const transactionId = request.txId;
    const { obUserPsId } = request.obUserIdentity;

    logInfo(`[${transactionId}] [CONTROLLER] getChatGroups initiated for psId: ${obUserPsId}`);

    try {
      const { activeGroups, inactiveGroups } = await chatV2Service.getAllChatGroupsByUser(transactionId, obUserPsId);

      const lastReadMessageIds = await chatV2Service.findMessageReadStatusByGroupIds(
        transactionId,
        activeGroups.map((group) => group.groupId),
        obUserPsId,
      );

      response.status(HttpStatusCode.OK).json(
        [...activeGroups, ...inactiveGroups].map((chatGroup) =>
          mapDBChatV2GroupToApiPayload(chatGroup, {
            readGroupReceipts: lastReadMessageIds,
          }),
        ),
      );

      logInfo(`[${transactionId}] [CONTROLLER] getChatGroups SUCCESSFUL for psId: ${obUserPsId}`);
    } catch (error) {
      logError(
        `[${transactionId}] [CONTROLLER] getChatGroups FAILED for psId: ${obUserPsId}, reason: ${error.message}`,
      );

      next(error);
    }
  };

  private getChatGroupDetails = async (
    request: express.Request,
    response: express.Response<ChatV2GroupDetailsPayloadType>,
    next: NextFunction,
  ) => {
    const transactionId = request.txId;
    const { groupId } = request.params;
    const { assumedBranchIds, branchIds } = request.obUserIdentity;

    logInfo(`[${transactionId}] [CONTROLLER] getChatGroupDetails initiated for groupId: ${groupId}`);

    try {
      if (!groupId) {
        logError(`[${transactionId}] [CONTROLLER] getChatGroupDetails: groupId is missing!`);

        throw new Error('GroupId is missing!');
      }

      const currentBranchIds = getEffectiveBranchIds(assumedBranchIds, branchIds);
      const chatGroup = await chatV2Service.getChatGroupByGroupId(transactionId, groupId);

      if (!chatGroup) {
        logError(`[${transactionId}] [CONTROLLER] getChatGroupDetails: Group not found for groupId: ${groupId}`);

        throw new Error('Chat group not found');
      }

      if (!new Set(currentBranchIds).has(chatGroup.branchId)) {
        throw new Error('Unauthorized access to chat group');
      }

      const groupContacts = await chatV2Service.getChatGroupUsers(transactionId, groupId, chatGroup.branchId);

      const formattedGroupDetails = mapDBChatV2GroupDetailsToApiPayload(chatGroup, groupContacts);

      logInfo(`[${transactionId}] [CONTROLLER] getChatGroupDetails SUCCESSFUL for groupId: ${groupId}`);

      response.status(HttpStatusCode.OK).json(formattedGroupDetails);
    } catch (error) {
      logError(`[${transactionId}] [CONTROLLER] getChatGroupDetails FAILED, reason: ${error.message}`);
      next(error);
    }
  };

  private syncChatGroups = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;
    const { branchId } = request.body;

    logInfo(`[${transactionId}] [CONTROLLER] syncChatGroups initiated for branchId: ${branchId}`);

    try {
      logInfo(`[${transactionId}] [CONTROLLER] syncChatGroups sync user access for branchId: ${branchId}`);

      await chatV2Service.syncChatUserAccessForBranch(transactionId, branchId);

      logInfo(`[${transactionId}] [CONTROLLER] syncChatGroups sync user access SUCCESSFUL for branchId: ${branchId}`);

      const obUsers = await userService.getObUsersByBranchIds(transactionId, [branchId], [1]);

      logInfo(
        `[${transactionId}] [CONTROLLER] syncChatGroups direct message group creation for branchId: ${branchId}, field staff count: ${obUsers.length}`,
      );

      for (const obUser of obUsers) {
        await chatV2Service.syncBranchChatAbility(transactionId, obUser.employeePsId, branchId);
      }

      logInfo(
        `[${transactionId}] [CONTROLLER] syncChatGroups direct message group creation SUCCESSFUL for branchId: ${branchId}`,
      );

      response.status(HttpStatusCode.OK).json({
        status: true,
      });
    } catch (syncErr) {
      logError(`[${transactionId}] [CONTROLLER] syncChatGroups FAILED, reason: ${syncErr.message}`);

      next(syncErr);
    }
  };

  private removeChatV2Group = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] removeChatV2Group initiated`);

    try {
      const { groupId } = request.params;
      const { force }: { force?: string } = request.query;

      // TODO Validate if the groupId belongs to the group admin branch
      await chatV2Service.removeChatGroupByGroupId(transactionId, groupId, force === 'true');

      response.status(HttpStatusCode.OK).json({
        status: true,
        groupId,
      });
    } catch (removeErr) {
      logError(`[${transactionId}] [CONTROLLER] removeChatV2Group FAILED, reason: ${removeErr.message}`);

      next(removeErr);
    }
  };

  private deleteChatGroup = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] updateChatGroups initiated`);

    try {
      const {
        groupId,
        branchId,
        employeePsId,
        quickBloxId,
        activeStatus,
      }: {
        groupId?: string;
        branchId?: string;
        quickBloxId?: string;
        activeStatus?: ActiveStateEnum;
        employeePsId?: string;
      } = request.query;

      if (!groupId && !branchId && !employeePsId && !quickBloxId && !activeStatus) {
        throw new Error('Required Fields are missing!');
      }

      const deletedCount = await chatService.deleteGroupUserOB(transactionId, {
        groupId,
        branchId,
        employeePsId,
        quickBloxId,
        activeStatus,
      });

      response.status(HttpStatusCode.OK).json({
        status: true,
        deletedCount,
      });
    } catch (deleteErr) {
      logError(`[${transactionId}] [CONTROLLER] deleteChatGroup FAILED, reason: ${deleteErr.message}`);

      next(deleteErr);
    }
  };

  private chatV2ActionTriggered = async (
    request: express.Request<undefined, undefined, HttpChatV2ActionInputType, undefined, undefined>,
    response: express.Response,
    next: NextFunction,
  ) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] chatV2ActionTriggered initiated`);

    try {
      const { accessLvl, obUserPsId } = request.obUserIdentity;
      const { groupId, actionType, currentBranchId, textMessage, messageId } = request.body;

      const [chatV2Group, isChatEnabledForCurrentBranch, isChatV2Eligible] = await Promise.all([
        chatV2Service.getChatGroupByGroupId(transactionId, groupId),
        featureProvisioningService.getProvisionForBranchId(
          transactionId,
          BranchFeaturesProvisionEnum.Chats,
          currentBranchId,
          accessLvl,
        ),
        chatV2Service.isEligibleForNewChatVendor(transactionId, obUserPsId),
      ]);

      if (!chatV2Group || !chatConfig.notifyUsers || !isChatEnabledForCurrentBranch || !isChatV2Eligible) {
        response.send('OK');

        return;
      }

      await chatV2Service.recordMessageActivityInChatGroup(transactionId, groupId, actionType, {
        messageId,
        message: textMessage,
        userPsId: obUserPsId,
      });

      logInfo(
        `[${transactionId}] [CONTROLLER] chatV2ActionTriggered record message activity SUCCESSFUL for psId: ${obUserPsId}, actionType: ${actionType}`,
      );

      if (actionType === 'MessageSent' && textMessage) {
        const maxBodyLength = 145;
        const trimmedMessage =
          textMessage.length < maxBodyLength ? textMessage : `${textMessage.slice(0, maxBodyLength - 3)}...`;

        const notificationPayload = {
          title: 'New message',
          body: trimmedMessage ?? '1 message received',
          optionalData: {
            deeplinkTo: ScreenEnum.ChatScreen,
            deeplinkParams: undefined,
            deepLinkParamsStringified: JSON.stringify({ groupId }),
          },
        };

        const isFieldStaff = mapAccessLevelToName(accessLvl) === UserLevelEnum.FIELD_STAFF;
        const targetLevels = isFieldStaff
          ? chatConfig.notifiableAdminLevels // Notify admin levels when field staff sends message
          : [1]; // Notify field staff when admin sends message

        // Send notifications to all target levels
        await Promise.all(
          targetLevels.map(async (jobLevel) => {
            const topicName = prefixTopicNameForGroupAndJobLevel(chatV2Group.groupId, jobLevel);
            await pushNotificationService.sendPushNotificationByTopic(transactionId, topicName, notificationPayload);
          }),
        );

        logInfo(
          `[${transactionId}] [CONTROLLER] chatV2ActionTriggered SUCCESSFUL for psId: ${obUserPsId}, actionType: ${actionType}`,
        );
      }

      response.send('RECORDED!');
    } catch (actionErr) {
      logError(`[${transactionId}] [CONTROLLER] chatV2ActionTriggered FAILED, reason: ${actionErr.message}`);
      next(actionErr);
    }
  };

  private chatActionTriggered = async (
    request: express.Request<undefined, undefined, HttpChatV2ActionInputType, undefined, undefined>,
    response: express.Response,
    next: NextFunction,
  ) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] chatActionTriggered initiated`);

    try {
      const { accessLvl, obUserPsId } = request.obUserIdentity;
      const { groupId, actionType, hasAttachment, currentBranchId, textMessage, version } = request.body;

      const isAlternateVersion = version === 'v2';

      if (isAlternateVersion) {
        this.chatV2ActionTriggered(request, response, next);

        return;
      }

      const [chatGroup, isChatEnabledForCurrentBranch] = await Promise.all([
        chatService.getChatGroupById(transactionId, groupId, {
          branchId: currentBranchId,
          psId: obUserPsId,
        }),
        featureProvisioningService.getProvisionForBranchId(
          transactionId,
          BranchFeaturesProvisionEnum.Chats,
          currentBranchId,
          accessLvl,
        ),
      ]);

      if (!chatConfig.notifyUsers || !isChatEnabledForCurrentBranch) {
        response.send('OK');

        return;
      }

      const maxBodyLength = 145;
      const trimmedMessage =
        textMessage?.length > maxBodyLength - 3 ? textMessage.substring(0, maxBodyLength - 3) + '...' : textMessage;

      const notificationData = {
        title: 'New message',
        body: trimmedMessage ?? '1 message received',
        redirectionScreen: ScreenEnum.ChatScreen,
      };

      let jobCategory: JobCategoryEnum;
      const groupNameLower = chatGroup.groupName.toLowerCase();
      if (groupNameLower.includes('non-clinical')) {
        jobCategory = JobCategoryEnum.NonClinical;
      } else if (groupNameLower.includes('clinical')) {
        jobCategory = JobCategoryEnum.Clinical;
      }
      const notifyByJobLevel = async (jobLevel: number) => {
        await notificationService.notifyBranchAndJobLevelByTopicName(
          transactionId,
          currentBranchId,
          { jobLevel, jobCategory },
          notificationData,
        );
      };

      logInfo(
        `[${transactionId}] [CONTROLLER] chatActionTriggered groupType:${
          chatGroup.groupType
        }, accessLevel: ${mapAccessLevelToName(accessLvl)}`,
      );

      if (chatGroup.groupType === ChatGroupEnum.Group) {
        if (mapAccessLevelToName(accessLvl) === UserLevelEnum.FIELD_STAFF) {
          // When a single user (U1) send a message to a branch, should notify all admin users (U2 to U5 based on notifiableAdminLevels) of the branch.
          for (const jobLevel of chatConfig.notifiableAdminLevels) {
            await notifyByJobLevel(jobLevel);
          }
        } else {
          // When the admin send a message to a U1 user's group, should notify the individual user (U1)
          const { employeePsId: groupCreatorPsId } = await chatService.getChatGroupById(transactionId, groupId, {
            branchId: currentBranchId,
            isGroupCreator: true,
          });
          await notificationService.notifyEmployeeByTopicName(transactionId, groupCreatorPsId, notificationData);
        }
      } else if (chatGroup.groupType === ChatGroupEnum.Broadcast) {
        if (mapAccessLevelToName(accessLvl) === UserLevelEnum.FIELD_STAFF) {
          // When a single user (U1) send a message to a branch, should notify all admin users (U2 to U5 based on notifiableAdminLevels) of the branch.
          for (const jobLevel of chatConfig.notifiableAdminLevels) {
            await notifyByJobLevel(jobLevel);
          }
        } else {
          // When the admin send a message to a broadcast group, should notify all U1 users in the broadcast group
          await notifyByJobLevel(1);
        }
      }

      logInfo(
        `[${transactionId}] [CONTROLLER] chatActionTriggered SUCCESSFUL for branchId: ${currentBranchId}, details: ${JSON.stringify(
          {
            groupId,
            actionType,
            hasAttachment,
            currentBranchId,
          },
        )}`,
      );

      response.send('Notified!');
    } catch (actionErr) {
      logError(`[${transactionId}] [CONTROLLER] chatActionTriggered FAILED, reason: ${actionErr.message}`);

      next(actionErr);
    }
  };

  private getAttachment = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] getAttachment initiated`);

    try {
      const { fileIdentifier }: { fileIdentifier?: string } = request.query;

      if (!fileIdentifier) {
        throw new Error('Required fields are missing!');
      }

      const attachmentUrl = await chatV2Service.getAttachmentUrlForChat(transactionId, fileIdentifier);

      response.status(HttpStatusCode.OK).json({
        fileIdentifier,
        attachmentUrl,
      });
    } catch (getErr) {
      logError(`[${transactionId}] [CONTROLLER] getAttachment FAILED, reason: ${getErr.message}`);

      next(getErr);
    }
  };

  private attachFile = async (
    request: express.Request,
    response: express.Response<ChatV2AttachmentPayloadType>,
    next: NextFunction,
  ) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] attachFile initiated`);

    try {
      const {
        phase,
        uploadId,
        partsCount,
        fileIdentifier,
        uniqueFileName,
        multipart = false,
        uploadedParts,
      } = request.body as HttpPostChatAttachmentInputType;

      if (!uniqueFileName) {
        throw new Error('Required fields are missing!');
      }

      const { file } = request;

      if (file && !phase && !multipart) {
        // Single file upload
        logInfo(`[${transactionId}] [CONTROLLER] attachFile Smaller file upload initiated`);

        const uploadedInfo = await chatV2Service.attachSmallAttachmentForChat(transactionId, file, uniqueFileName);

        response.status(HttpStatusCode.OK).json({
          fileIdentifier: uploadedInfo.fileIdentifier,
          attachmentUrl: uploadedInfo.signedUrl,
        });

        logInfo(`[${transactionId}] [CONTROLLER] attachFile Smaller file upload SUCCESSFUL`);

        return;
      }

      if (file || !phase || !multipart || !uniqueFileName) {
        throw new Error('Required fields are missing!');
      }

      // Multipart large file upload
      logInfo(`[${transactionId}] [CONTROLLER] attachFile Large file upload initiated, phase: ${phase}`);

      // TODO: Use a util/helper to validate if fileExtension is compatible with the mimetype
      const fileExtension = uniqueFileName.split('.').pop();
      if (fileExtension) {
        logInfo(`[${transactionId}] [CONTROLLER] attachFile Large file upload for file extension: ${fileExtension}`);
      }

      if (phase === MultipartUploadPhaseEnum.create && partsCount) {
        const uploadParams = await chatV2Service.initiateLargeAttachmentForChat(
          transactionId,
          uniqueFileName,
          partsCount,
        );

        response.status(HttpStatusCode.OK).json({
          fileIdentifier: uploadParams.fileIdentifier,
          signedUrls: uploadParams.signedUrls,
          uploadUrls: uploadParams.signedUrls,
          uploadId: uploadParams.uploadId,
        });

        logInfo(`[${transactionId}] [CONTROLLER] attachFile Large file upload SUCCESSFUL for phase: ${phase}`);

        return;
      }

      if (phase === MultipartUploadPhaseEnum.complete && uploadId && uploadedParts && fileIdentifier) {
        const attachedUrl = await chatV2Service.finalizeLargeAttachmentForChat(transactionId, fileIdentifier, {
          uploadId,
          uploadedParts,
        });

        response.status(HttpStatusCode.OK).json({
          fileIdentifier,
          attachmentUrl: attachedUrl,
        });

        logInfo(`[${transactionId}] [CONTROLLER] attachFile Large file upload SUCCESSFUL for phase: ${phase}`);

        return;
      }

      // TODO cancel phase
      throw new Error('Unexpected phase');
    } catch (attachErr) {
      logError(`[${transactionId}] [CONTROLLER] attachFile FAILED, reason: ${attachErr.message}`);

      next(attachErr);
    }
  };

  private getChatContacts = async (
    request: express.Request,
    response: express.Response<ChatV2ContactPayloadType[]>,
    next: NextFunction,
  ) => {
    const transactionId = request.txId;

    try {
      logInfo(`[${transactionId}] [CONTROLLER] getChatContacts initiated`);

      const { branchIds, assumedBranchIds } = request.obUserIdentity;

      const currentBranchIds = getEffectiveBranchIds(assumedBranchIds, branchIds);

      let contactListLimit = 1000;
      if (currentBranchIds.length > 6) {
        contactListLimit = 8000;
      }

      const contacts = await chatV2Service.getBranchContacts(transactionId, currentBranchIds, {
        skip: 0,
        limit: contactListLimit,
      });

      response.status(HttpStatusCode.OK).json(contacts);
    } catch (contactErr) {
      logError(`[${transactionId}] [CONTROLLER] getChatContacts FAILED, reason: ${contactErr.message}`);

      next(contactErr);
    }
  };

  private getGroupMemberIds = async (
    request: express.Request,
    response: express.Response<{ userPsId: string; role: UserAccessModeEnum }[]>,
    next: NextFunction,
  ) => {
    const transactionId = request.txId;

    try {
      logInfo(`[${transactionId}] [CONTROLLER] getChatContacts initiated`);

      const { branchIds, assumedBranchIds } = request.obUserIdentity;
      const { groupId } = request.params as { groupId: string };

      const activeGroup = await chatV2Service.getChatGroupByGroupId(transactionId, groupId);

      if (!activeGroup || !new Set([...branchIds, ...assumedBranchIds]).has(activeGroup.branchId)) {
        throw new Error('Invalid group requested');
      }

      const groupContacts = await chatV2Service.getChatGroupUsers(transactionId, groupId, activeGroup.branchId);

      response.status(HttpStatusCode.OK).json(
        groupContacts.map((groupContact) => {
          return {
            userPsId: groupContact.employeePsId,
            role: groupContact.accessMode,
          };
        }),
      );
    } catch (contactErr) {
      logError(`[${transactionId}] [CONTROLLER] getChatContacts FAILED, reason: ${contactErr.message}`);

      next(contactErr);
    }
  };
}
