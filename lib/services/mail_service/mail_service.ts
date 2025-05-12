import axios, { AxiosResponse } from 'axios';
import config from 'config';
import ms from 'ms';
import { tempDataService, userService } from '..';
import { ActiveEnum, TempDataValueEnum } from '../../enums';
import { logInfo, logError } from '../../log/util';
import {
  AttachmentUploadUrlResponseFromSystemType,
  DraftMessagePayloadType,
  HttpPutAttachmentUploadRequestInputType,
  MailDetailsPreviewFromSystemType,
  MailPreviewListFromSystemType,
  MailUserConsumerType,
  SendEmailToSystemType,
  SendMailResponseFromSystemType,
  TempDataUpsertOperationType,
  ConfigType,
  UpdateMessagesStatusToSystemType,
} from '../../types';

import { createNanoId, prefixDraftMessageId } from '../../utils';

import { getSecret } from '../../vendors';

const employeeServiceConfig: {
  endpoint: string;
  apiKeyHeader: string;
  secretKeyName: string;
} = config.get('Services.employeeService');

const mailServiceConfig: ConfigType['Services']['mailService'] = config.get('Services.mailService');

const fetchMessagesByEmployeeId = async (
  transactionId: string,
  employeeId: string,
  options: {
    folder?: 'inbox' | 'sent' | string;
    limit?: number;
    lastCursorId?: string;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
  },
  bearerToken: string,
): Promise<MailPreviewListFromSystemType> => {
  logInfo(`[${transactionId}] [SERVICE] [MAILS] fetchMessagesByEmployeeId INITIATED for employeeId: ${employeeId}`);

  try {
    if (!employeeId) {
      throw new Error('Unable to fetch messages without a valid employee ID.');
    }

    const { folder, limit, lastCursorId, sortField, sortOrder } = options;

    const response: AxiosResponse<MailPreviewListFromSystemType> = await axios.request({
      method: 'GET',
      proxy: {
        protocol: 'https',
        host: mailServiceConfig.vpceHost,
        port: 443,
      },
      baseURL: mailServiceConfig.hostUrl,
      url: `${mailServiceConfig.envPrefix}/mail/api/v1/employees/${employeeId}/messages`,
      headers: {
        Authorization: bearerToken,
        'Content-Type': 'application/json',
      },
      params: {
        ...(folder && { folder }),
        ...(limit && { limit }),
        ...(lastCursorId && { last_cursor_id: lastCursorId }),
        ...(sortField && sortOrder && { sort: `${sortField}:${sortOrder}` }),
      },
    });

    logInfo(`[${transactionId}] [SERVICE] [MAILS] fetchMessagesByEmployeeId SUCCESS for employeeId: ${employeeId}`);

    return response.data as MailPreviewListFromSystemType;
  } catch (error) {
    logError(
      `[${transactionId}] [SERVICE] [MAILS] fetchMessagesByEmployeeId FAILED for employeeId: ${employeeId}, reason: ${error.message}`,
    );
    throw new Error('Failed to fetch messages');
  }
};

const fetchMessageById = async (
  transactionId: string,
  employeeId: string,
  messageId: string,
  bearerToken: string,
): Promise<MailDetailsPreviewFromSystemType> => {
  logInfo(
    `[${transactionId}] [SERVICE] [MAILS] fetchMessageById INITIATED for employeeId: ${employeeId}, messageId: ${messageId}`,
  );

  if (!messageId || !employeeId) {
    throw new Error('Unable to retrieve message, please provide the messageId and employeeId!');
  }

  try {
    const response: AxiosResponse<MailDetailsPreviewFromSystemType> = await axios.request({
      method: 'GET',
      proxy: {
        protocol: 'https',
        host: mailServiceConfig.vpceHost,
        port: 443,
      },
      baseURL: mailServiceConfig.hostUrl,
      url: `${mailServiceConfig.envPrefix}/mail/api/v1/employees/${employeeId}/messages/${messageId}`,
      headers: {
        Authorization: bearerToken,
        'Content-Type': 'application/json',
      },
    });

    logInfo(
      `[${transactionId}] [SERVICE] [MAILS] fetchMessageById SUCCESS for employeeId: ${employeeId}, messageId: ${messageId}`,
    );

    return response.data;
  } catch (error) {
    logError(
      `[${transactionId}] [SERVICE] [MAILS] fetchMessageById FAILED for employeeId: ${employeeId}, messageId: ${messageId}, reason: ${error.message}`,
    );
    throw new Error('Failed to fetch message');
  }
};

const getAttachmentUploadUrls = async (
  transactionId: string,
  employeeId: string,
  attachments: HttpPutAttachmentUploadRequestInputType,
  bearerToken: string,
): Promise<AttachmentUploadUrlResponseFromSystemType> => {
  logInfo(`[${transactionId}] [SERVICE] [MAILS] getAttachmentUploadUrls INITIATED for employeeId: ${employeeId}`);

  if (!Array.isArray(attachments) || attachments.length === 0) {
    throw new Error('Please provide at least one attachment');
  }

  try {
    const response: AxiosResponse<AttachmentUploadUrlResponseFromSystemType> = await axios.request({
      method: 'POST',
      proxy: {
        protocol: 'https',
        host: mailServiceConfig.vpceHost,
        port: 443,
      },
      baseURL: mailServiceConfig.hostUrl,
      url: `${mailServiceConfig.envPrefix}/mail/api/v1/employees/${employeeId}/messages/attachments`,
      headers: {
        Authorization: bearerToken,
        'Content-Type': 'application/json',
      },
      data: { attachments },
    });

    logInfo(`[${transactionId}] [SERVICE] [MAILS] getAttachmentUploadUrls SUCCESS for employeeId: ${employeeId}`);

    return response.data;
  } catch (error) {
    logError(
      `[${transactionId}] [SERVICE] [MAILS] getAttachmentUploadUrls FAILED for employeeId: ${employeeId}, reason: ${error.message}`,
    );
    throw new Error('Failed to retrieve attachment upload URLs');
  }
};

const sendMail = async (
  transactionId: string,
  employeeId: string,
  mailPayload: SendEmailToSystemType,
  bearerToken: string,
): Promise<SendMailResponseFromSystemType> => {
  logInfo(`[${transactionId}] [SERVICE] [MAILS] sendMail INITIATED for employeeId: ${employeeId}`);

  if (!Array.isArray(mailPayload.to) || mailPayload.to.length === 0) {
    throw new Error('Please provide at least one recipient in the "to" field.');
  }

  try {
    const response: AxiosResponse<SendMailResponseFromSystemType> = await axios.request({
      method: 'POST',
      proxy: {
        protocol: 'https',
        host: mailServiceConfig.vpceHost,
        port: 443,
      },
      baseURL: mailServiceConfig.hostUrl,
      url: `${mailServiceConfig.envPrefix}/mail/api/v1/employees/${employeeId}/messages`,
      headers: {
        Authorization: bearerToken,
        'Content-Type': 'application/json',
      },
      data: mailPayload,
    });

    logInfo(`[${transactionId}] [SERVICE] [MAILS] sendMail SUCCESS for employeeId: ${employeeId}`);

    return response.data;
  } catch (error) {
    logError(
      `[${transactionId}] [SERVICE] [MAILS] sendMail FAILED for employeeId: ${employeeId}, reason: ${error.message}`,
    );
    throw new Error('Failed to send email');
  }
};

const fetchDraftById = async (
  transactionId: string,
  draftMessageId: string,
): Promise<DraftMessagePayloadType | null> => {
  logInfo(`[${transactionId}] [SERVICE] [MAILS] fetchDraftById - INITIATED for draftMessageId: ${draftMessageId}`);

  if (!draftMessageId) {
    throw new Error('Unable to get draft message, please provide the draftMessageId!');
  }

  try {
    const previousDraft = await tempDataService.getLatestDraft(
      transactionId,
      draftMessageId,
      TempDataValueEnum.MailDraft,
    );

    if (!previousDraft) {
      throw new Error(`Draft message with ID ${draftMessageId} was not found`);
    }

    const { payload } = previousDraft;

    logInfo(`[${transactionId}] [SERVICE] [MAILS] fetchDraftById - SUCCESS for draftMessageId: ${draftMessageId}`);

    return (payload ?? null) as DraftMessagePayloadType;
  } catch (error) {
    logError(`[${transactionId}] [SERVICE] [MAILS] fetchDraftById - ERROR: ${error.message}`);

    return null;
  }
};

const updateMailMessagesStatus = async (
  transactionId: string,
  employeeId: string,
  updateMailStatusPayload: UpdateMessagesStatusToSystemType,
  bearerToken: string,
): Promise<SendMailResponseFromSystemType> => {
  const { messageIds } = updateMailStatusPayload;

  logInfo(
    `[${transactionId}] [SERVICE] [MAILS] updateMailMessagesStatus INITIATED for messageIds: ${messageIds.join(', ')}`,
  );

  try {
    const response: AxiosResponse<SendMailResponseFromSystemType> = await axios.request({
      method: 'PATCH',
      proxy: {
        protocol: 'https',
        host: mailServiceConfig.vpceHost,
        port: 443,
      },
      baseURL: mailServiceConfig.hostUrl,
      url: `${mailServiceConfig.envPrefix}/mail/api/v1/employees/${employeeId}/messages`,
      headers: {
        Authorization: bearerToken,
        'Content-Type': 'application/json',
      },
      data: updateMailStatusPayload,
    });

    logInfo(
      `[${transactionId}] [SERVICE] [MAILS] updateMailMessagesStatus SUCCESS for messageIds: ${messageIds.join(', ')}`,
    );

    return response.data;
  } catch (error) {
    logError(
      `[${transactionId}] [SERVICE] [MAILS] updateMailMessagesStatus FAILED for messageIds: ${messageIds.join(
        ', ',
      )}, reason: ${error.message}`,
    );
    throw error;
  }
};

// upsertDraft(txId, psId: string, draftData)
const upsertDraft = async (
  transactionId: string,
  employeePsId: string,
  draftData: DraftMessagePayloadType,
): Promise<DraftMessagePayloadType> => {
  logInfo(`[${transactionId}] [SERVICE] [MAILS] upsertDraft - INITIATED`);

  try {
    let overrideOptions = {};
    const { draftMessageId } = draftData;

    const tempData: TempDataUpsertOperationType = {
      primaryIdentifier: draftMessageId,
      secondaryIdentifier: employeePsId,
      valueType: TempDataValueEnum.MailDraft,
      payload: draftData,
    };

    if (draftMessageId) {
      const draft = await fetchDraftById(transactionId, draftMessageId);
      if (draft) {
        overrideOptions = { shouldOverride: true };
      }
    } else {
      const draftId = prefixDraftMessageId(createNanoId(5));
      tempData.payload.draftMessageId = draftId;
      tempData.primaryIdentifier = draftId;
    }

    await tempDataService.addTempData(transactionId, tempData, overrideOptions);

    logInfo(`[${transactionId}] [SERVICE] [MAILS] upsertDraft - SUCCESS for draftMessageId: ${draftMessageId}`);

    return { ...draftData, draftMessageId };
  } catch (error) {
    logError(`[${transactionId}] [SERVICE] [MAILS] upsertDraft - ERROR: ${error.message}`);
    throw error;
  }
};

const deleteDraftById = async (transactionId: string, draftMessageId: string): Promise<boolean> => {
  logInfo(`[${transactionId}] [SERVICE] [MAILS] deleteDraftById - INITIATED for draftMessageId: ${draftMessageId}`);

  try {
    if (!draftMessageId) {
      throw new Error('Unable to delete draft message, please provide the draftMessageId!');
    }

    const result = await tempDataService.deleteTempData(
      transactionId,
      draftMessageId,
      TempDataValueEnum.MailDraft,
      true,
    );

    if (result.isDeleted) {
      logInfo(`[${transactionId}] [SERVICE] [MAILS] deleteDraftById - SUCCESS for draftMessageId: ${draftMessageId}`);

      return result.isDeleted;
    } else {
      throw new Error(`Failed to delete draft message with ID "${draftMessageId}".`);
    }
  } catch (error) {
    logError(`[${transactionId}] [SERVICE] [MAILS] deleteDraftById - ERROR: ${error.message}`);
    throw error;
  }
};

const sendMailUsersDataToEmployeeService = async (
  transactionId: string,
  employeeData: MailUserConsumerType[],
): Promise<{ successfulPsIds: string[]; failedPsIds: string[] }> => {
  try {
    logInfo(`[${transactionId}] [SERVICE] sendMailUsersDataToEmployeeService - Creating user in employee microservice`);

    const apiKey = await getSecret(employeeServiceConfig.apiKeyHeader);

    const response = await axios.post(
      `${employeeServiceConfig.endpoint}/api/v1/employee_ps/mail-provision`,
      employeeData,
      {
        headers: {
          'Content-Type': 'application/json',
          [`${employeeServiceConfig.apiKeyHeader}`]: `${apiKey}`,
          timeout: ms('15s'),
        },
      },
    );

    logInfo(
      `[${transactionId}] [SERVICE] sendMailUsersDataToEmployeeService SUCCESSFUL: ${JSON.stringify(response.data)}`,
    );

    return response.data;
  } catch (createErr) {
    logError(`[${transactionId}] [SERVICE] sendMailUsersDataToEmployeeService FAILED, reason: ${createErr.message}`);

    return null;
  }
};

const syncMailboxForBranchId = async (transactionId: string, branchId: string, isSupported: boolean): Promise<void> => {
  logInfo(
    `[${transactionId}] [SERVICE] syncMailboxForBranchId initiated for branchId: ${branchId}, isSupported: ${isSupported}`,
  );

  try {
    const status = isSupported ? ActiveEnum.Enabled : ActiveEnum.Disabled;

    await userService.syncBranchForMailInbox(transactionId, branchId, status);

    logInfo(`[${transactionId}] [SERVICE] syncMailboxForBranchId - Branch ${branchId} status: ${status}`);

    return;
  } catch (error) {
    logError(
      `[${transactionId}] [SERVICE] syncMailboxForBranchId FAILED for branchId: ${branchId}, reason: ${error.message}`,
    );
    throw error;
  }
};

export {
  fetchMessagesByEmployeeId,
  fetchMessageById,
  sendMail,
  fetchDraftById,
  getAttachmentUploadUrls,
  sendMailUsersDataToEmployeeService,
  updateMailMessagesStatus,
  upsertDraft,
  deleteDraftById,
  syncMailboxForBranchId,
};
