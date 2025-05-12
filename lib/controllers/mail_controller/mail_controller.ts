import { HttpStatusCode } from '@bayshore-healthcare/lib-error-middleware';
import { pingAuthMiddleware } from '@bayshore-healthcare/lib-ping-authentication-middleware';
import config from 'config';
import express, { NextFunction, Response, Request } from 'express';
import { IAppConfig } from '../../config';
import { TempDataValueEnum, UserLevelEnum } from '../../enums';
import { logInfo, logError, getLogger } from '../../log/util';
import { identityMiddleware, serviceInternalMiddleware, accessControlMiddlewareHOF } from '../../middlewares';
import { mailService, notificationService, tempDataService, userService } from '../../services';
import {
  NotificationUpsertOperationType,
  MailNotificationConsumerType,
  MessagePayloadType,
  HttpPostSendMailInputType,
  MailPreviewListFromSystemType,
  MessageDetailsPayloadType,
  HttpPutAttachmentUploadRequestInputType,
  AttachmentUploadUrlResponseFromSystemType,
  AttachmentUploadUrlPayloadType,
  MailContactInfoPayloadType,
  HttpPatchMessagesStatusRequestInputType,
} from '../../types';
import {
  isValidDate,
  getEffectiveBranchIds,
  mapDBMailContactToApiPayload,
  mapDBMailMessageDetailsToApiPayload,
  mapDBMailMessageToApiPayload,
  mapDraftMailApiRequestToServiceRequest,
  mapMailNotificationApiRequestToServiceRequest,
  mapSendMailApiRequestToServiceRequest,
  subDays,
} from '../../utils';
import { BaseController } from '../base_controller';

const mailboxFeatureConfig: { mailDomainForFieldStaff: string } = config.get('Features.mailbox');

const logger = getLogger();

const authenticationMiddleware = pingAuthMiddleware({ logger });
export class MailController extends BaseController {
  public basePath: string;
  public router: express.Router;

  constructor(appConfig: IAppConfig) {
    super(appConfig.envConfig);
    this.basePath = `${this.API_BASE_URL}/mails`;
    this.router = express.Router();
    this.initializeRoutes();
  }

  public getBasePath(): string {
    return this.basePath;
  }

  public initializeRoutes(): void {
    this.router.post(
      `${this.basePath}/notify`,
      serviceInternalMiddleware,
      this.asyncHandler(this.createPushNotification),
    );

    this.router.get(
      `${this.basePath}/messages`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF]),
      this.asyncHandler(this.getMessages),
    );

    this.router.get(
      `${this.basePath}/messages/:messageId`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF]),
      this.asyncHandler(this.getMessageById),
    );

    this.router.post(
      `${this.basePath}/attachments`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF]),
      this.asyncHandler(this.handleAttachmentUploadUrlRequest),
    );

    this.router.post(
      `${this.basePath}/messages`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF]),
      this.asyncHandler(this.sendMail),
    );

    this.router.patch(
      `${this.basePath}/messages`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF]),
      this.asyncHandler(this.updateMailMessagesStatus),
    );

    this.router.post(
      `${this.basePath}/drafts`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF]),
      this.asyncHandler(this.saveDraftMessage),
    );

    this.router.get(
      `${this.basePath}/drafts`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF]),
      this.asyncHandler(this.getDraftMessages),
    );

    this.router.get(
      `${this.basePath}/drafts/:draftMessageId`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF]),
      this.asyncHandler(this.getDraftMessageById),
    );

    this.router.delete(
      `${this.basePath}/drafts/:draftMessageId`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF]),
      this.asyncHandler(this.deleteDraftMessage),
    );

    this.router.get(
      `${this.basePath}/contacts`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF]),
      this.asyncHandler(this.getContacts),
    );
  }

  private getMessages = async (request: Request, response: Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] [MAILS] getMessages INITIATED`);

    try {
      const { obUserPsId: employeePsId } = request.obUserIdentity;

      const {
        limit,
        folder,
        lastCursorId,
        sortField,
        sortOrder,
      }: {
        limit?: string;
        folder?: 'inbox' | 'sent' | string;
        sortField?: string;
        lastCursorId?: string;
        sortOrder?: 'asc' | 'desc';
      } = request.query;

      const messageData: MailPreviewListFromSystemType = await mailService.fetchMessagesByEmployeeId(
        transactionId,
        employeePsId,
        {
          folder,
          limit: parseInt(limit, 10) || 10,
          lastCursorId,
          sortField,
          sortOrder,
        },
        request.headers.authorization,
      );

      const { results: messageResults = [], total: totalCount = 0, pageSize = 0, hasMore = false } = messageData;

      const messages: MessagePayloadType[] = (messageResults || []).map(mapDBMailMessageToApiPayload);

      logInfo(
        `[${transactionId}] [CONTROLLER] [MAILS] getMessages SUCCESS for employeeId: ${employeePsId}, found ${messages.length} messages`,
      );

      response.status(200).json({
        totalCount,
        pageSize,
        hasMore,
        messages,
      });
    } catch (error) {
      logError(`[${transactionId}] [CONTROLLER] [MAILS] getMessages FAILED, reason: ${error.message}`);
      next(error);
    }
  };

  private getMessageById = async (request: Request, response: Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] [MAILS] getMessageById INITIATED`);

    try {
      const { obUserPsId: employeePsId } = request.obUserIdentity;
      const { messageId } = request.params;

      if (!messageId) {
        throw new Error('Unable to get message, please provide the messageId!');
      }

      const message = await mailService.fetchMessageById(
        transactionId,
        employeePsId,
        messageId,
        request.headers.authorization,
      );

      if (!message) {
        logInfo(`[${transactionId}] [CONTROLLER] [MAILS] getMessageById NOT FOUND for messageId: ${messageId}`);

        return response.status(404).json({ error: 'Message not found' });
      }

      const mappedMessage: MessageDetailsPayloadType = mapDBMailMessageDetailsToApiPayload(message);

      logInfo(
        `[${transactionId}] [CONTROLLER] [MAILS] getMessageById SUCCESS for employeeId: ${employeePsId}, messageId: ${messageId}`,
      );

      response.status(200).json(mappedMessage);
    } catch (error) {
      logError(`[${transactionId}] [CONTROLLER] [MAILS] getMessageById FAILED, reason: ${error.message}`);
      next(error);
    }
  };

  private sendMail = async (request: Request, response: Response, next: NextFunction) => {
    const transactionId = request.txId;
    logInfo(`[${transactionId}] [CONTROLLER] [MAILS] sendMailController INITIATED`);

    const { obUserPsId } = request.obUserIdentity;

    const { to, draftMessageId }: HttpPostSendMailInputType = request.body;

    try {
      if (!Array.isArray(to) || to.length === 0) {
        throw new Error('Please provide at least one recipient in the "to" field.');
      }

      const result = await mailService.sendMail(
        transactionId,
        obUserPsId,
        mapSendMailApiRequestToServiceRequest(request.body),
        request.headers.authorization,
      );

      logInfo(`[${transactionId}] [CONTROLLER] [MAILS] sendMailController SUCCESS for employeeId: ${obUserPsId}`);
      response.status(200).json({ message: 'Email sent successfully', data: result });

      if (draftMessageId) {
        await mailService.deleteDraftById(transactionId, draftMessageId);
      }
    } catch (error) {
      logError(`[${transactionId}] [CONTROLLER] [MAILS] sendMailController FAILED, reason: ${error.message}`);

      await mailService.upsertDraft(
        transactionId,
        draftMessageId,
        mapDraftMailApiRequestToServiceRequest(request.body),
      );
      next(error);
    }
  };

  private handleAttachmentUploadUrlRequest = async (req: Request, res: Response, next: NextFunction) => {
    const transactionId = req.txId;
    logInfo(`[${transactionId}] [CONTROLLER] [MAILS] handleAttachmentUploadUrlRequest INITIATED`);

    try {
      const attachments: HttpPutAttachmentUploadRequestInputType = req.body;

      if (!Array.isArray(attachments) || attachments.length === 0) {
        throw new Error('Please provide at least one attachment.');
      }

      const { obUserPsId: employeeId } = req.obUserIdentity;

      const validAttachments = attachments.filter((attachment) => {
        return attachment.fileName && attachment.mimeType;
      });

      const uploadUrls: AttachmentUploadUrlResponseFromSystemType = await mailService.getAttachmentUploadUrls(
        transactionId,
        employeeId,
        validAttachments,
        req.headers.authorization,
      );

      const mappedUploadUrls: AttachmentUploadUrlPayloadType = uploadUrls.map(
        ({ fileName, s3UploadKey, s3UploadUrl }) => ({
          fileName,
          uploadKey: s3UploadKey,
          uploadUrl: s3UploadUrl,
        }),
      );

      logInfo(
        `[${transactionId}] [CONTROLLER] [MAILS] handleAttachmentUploadUrlRequest SUCCESS for employeeId: ${employeeId}`,
      );
      res.status(200).json({ message: 'Attachment upload URLs retrieved successfully', data: mappedUploadUrls });
    } catch (error) {
      logError(
        `[${transactionId}] [CONTROLLER] [MAILS] handleAttachmentUploadUrlRequest FAILED, reason: ${error.message}`,
      );
      next(error);
    }
  };

  private updateMailMessagesStatus = async (request: Request, response: Response, next: NextFunction) => {
    const transactionId = request.txId;
    logInfo(`[${transactionId}] [CONTROLLER] [MAILS] updateMailMessagesStatus INITIATED`);

    const { messageIds, isRead }: HttpPatchMessagesStatusRequestInputType = request.body;

    try {
      if (!Array.isArray(messageIds) || messageIds.length === 0) {
        throw new Error('Please provide at least one message ID in the "messageIds" field.');
      }

      if (typeof isRead !== 'boolean') {
        throw new Error('The "isRead" field must be a boolean.');
      }

      const { obUserPsId: employeeId } = request.obUserIdentity;

      const result = await mailService.updateMailMessagesStatus(
        transactionId,
        employeeId,
        { messageIds, isRead },
        request.headers.authorization,
      );

      logInfo(
        `[${transactionId}] [CONTROLLER] [MAILS] updateMailMessagesStatus SUCCESS for messageIds: ${messageIds.join(
          ', ',
        )}`,
      );
      response.status(200).json(result);
    } catch (error) {
      logError(`[${transactionId}] [CONTROLLER] [MAILS] updateMailMessagesStatus FAILED, reason: ${error.message}`);
      next(error);
    }
  };

  private createPushNotification = async (request: Request, response: Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] [MAILS] createPushNotification INITIATED`);

    try {
      const notification: MailNotificationConsumerType = request.body;

      logInfo(
        `[${transactionId}] [CONTROLLER] [MAILS] createPushNotification received request payload ${JSON.stringify(
          notification,
        )}`,
      );

      if (!notification.employeePsId) {
        throw new Error('Employee psId is required');
      }

      const mappedNotification: NotificationUpsertOperationType =
        mapMailNotificationApiRequestToServiceRequest(notification);

      logInfo(
        `[${transactionId}] [CONTROLLER] [MAILS] createPushNotification created mapped payload ${JSON.stringify(
          mappedNotification,
        )}`,
      );

      const sentPushNotificationId = await notificationService.sendNotification(transactionId, mappedNotification);

      logInfo(
        `[${transactionId}] [CONTROLLER] [MAILS] createPushNotification SUCCESSFULLY created mail push notification with notificationId: ${sentPushNotificationId}`,
      );

      response.status(HttpStatusCode.OK).json({
        success: true,
        data: `${sentPushNotificationId}`,
      });
    } catch (createErr) {
      logError(`[${transactionId}] [CONTROLLER] [MAILS] createPushNotification FAILED, reason: ${createErr.message}`);

      next(createErr);
    }
  };

  private saveDraftMessage = async (request: Request, response: Response, next: NextFunction) => {
    const transactionId = request.txId;
    logInfo(`[${transactionId}] [CONTROLLER] [MAILS] saveDraftMessage INITIATED`);

    const draftMessagePayload: HttpPostSendMailInputType = request.body;

    const draft = mapDraftMailApiRequestToServiceRequest(draftMessagePayload);

    const { obUserPsId } = request.obUserIdentity;

    try {
      await mailService.upsertDraft(transactionId, obUserPsId, draft);

      logInfo(`[${transactionId}] [CONTROLLER] [MAILS] saveDraftMessage SUCCESS`);
      response.status(200).json({ message: 'Draft message saved successfully', data: draft });
    } catch (error) {
      logError(`[${transactionId}] [CONTROLLER] [MAILS] saveDraftMessage FAILED, reason: ${error.message}`);
      next(error);
    }
  };

  private getDraftMessages = async (request: Request, response: Response, next: NextFunction) => {
    const transactionId = request.txId;
    logInfo(`[${transactionId}] [CONTROLLER] [MAILS] getDraftMessages INITIATED`);

    try {
      const { obUserPsId } = request.obUserIdentity;

      const {
        startDate,
        endDate,
        limit,
      }: {
        startDate?: Date;
        endDate?: Date;
        limit?: string;
      } = request.query;

      const draftStartDate = isValidDate(new Date(startDate)) ? new Date(startDate) : subDays(new Date(), 60);
      const draftEndDate = isValidDate(new Date(endDate)) ? new Date(endDate) : new Date();

      const drafts = await tempDataService.getTempDataBySecondaryId(
        transactionId,
        TempDataValueEnum.MailDraft,
        obUserPsId,
        {
          startDate: draftStartDate,
          endDate: draftEndDate,
        },
        {
          limit: parseInt(limit, 10) || 20,
        },
      );

      logInfo(`[${transactionId}] [CONTROLLER] [MAILS] getDraftMessages SUCCESS`);

      response.status(200).json(drafts.map(({ payload }) => payload));
    } catch (error) {
      logError(`[${transactionId}] [CONTROLLER] [MAILS] getDraftMessages FAILED, reason: ${error.message}`);
      next(error);
    }
  };

  private getDraftMessageById = async (request: Request, response: Response, next: NextFunction) => {
    const transactionId = request.txId;
    logInfo(`[${transactionId}] [CONTROLLER] [MAILS] getDraftMessageById INITIATED`);

    try {
      const { draftMessageId } = request.params;

      if (!draftMessageId) {
        throw new Error('Unable to get draft message, please provide the draftMessageId!');
      }
      const draft = await mailService.fetchDraftById(transactionId, draftMessageId);

      logInfo(`[${transactionId}] [CONTROLLER] [MAILS] getDraftMessageById SUCCESS`);
      response.status(200).json(draft);
    } catch (error) {
      logError(`[${transactionId}] [CONTROLLER] [MAILS] getDraftMessageById FAILED, reason: ${error.message}`);
      next(error);
    }
  };

  private deleteDraftMessage = async (request: Request, response: Response, next: NextFunction) => {
    const transactionId = request.txId;
    logInfo(`[${transactionId}] [CONTROLLER] [MAILS] deleteDraftMessage INITIATED`);

    try {
      const { draftMessageId } = request.params;

      if (!draftMessageId) {
        throw new Error('Unable to get draft message, please provide the draftMessageId!');
      }

      const isDeleted = await mailService.deleteDraftById(transactionId, draftMessageId);

      logInfo(`[${transactionId}] [CONTROLLER] [MAILS] deleteDraftMessage SUCCESS`);
      response.status(200).json({ message: 'Draft message deleted successfully', isDeleted });
    } catch (error) {
      logError(`[${transactionId}] [CONTROLLER] [MAILS] deleteDraftMessage FAILED, reason: ${error.message}`);
      next(error);
    }
  };

  private getContacts = async (request: Request, response: Response, next: NextFunction) => {
    const transactionId = request.txId;
    logInfo(`[${transactionId}] [CONTROLLER] [CONTACTS] getContacts INITIATED`);

    try {
      const {
        limit,
        lastCursorId,
        search = '',
        sortField,
        sortOrder,
      }: {
        limit?: string;
        lastCursorId?: string;
        search?: string;
        sortField?: string;
        sortOrder?: 'asc' | 'desc';
      } = request.query;

      const MIN_CONTACT_SEARCH_LENGTH = 3;

      if (!search || search.length < MIN_CONTACT_SEARCH_LENGTH) {
        throw new Error(`Search term is required and must be at least ${MIN_CONTACT_SEARCH_LENGTH} characters long.`);
      }

      const { obUserPsId } = request.obUserIdentity;

      const { branchAccess } = await userService.getObUsersByPsId(transactionId, obUserPsId);

      const { mailDomainForFieldStaff } = mailboxFeatureConfig;

      const effectiveBranchIds: string[] = getEffectiveBranchIds(
        branchAccess.overriddenBranchIds,
        branchAccess.selectedBranchIds,
      );

      const users = await userService.getObUsersByBranchIds(transactionId, effectiveBranchIds, [1, 2, 3, 4, 5], {
        limit: parseInt(limit, 10) || 20,
        search,
        lastCursorId,
        sortField,
        sortOrder,
      });

      const mappedUsers: MailContactInfoPayloadType[] = users.map((user) =>
        mapDBMailContactToApiPayload(user, mailDomainForFieldStaff),
      );

      logInfo(`[${transactionId}] [CONTROLLER] [CONTACTS] getContacts SUCCESS`);
      response.status(200).json(mappedUsers);
    } catch (error) {
      logError(`[${transactionId}] [CONTROLLER] [CONTACTS] getContacts FAILED, reason: ${error.message}`);
      next(error);
    }
  };
}
