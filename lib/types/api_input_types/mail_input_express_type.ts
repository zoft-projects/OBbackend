import { PriorityEnum } from '../../enums';

type EmailRecipientType = {
  displayName?: string;
  email: string;
};

type HttpPostSendMailInputType = {
  to: EmailRecipientType[];
  cc?: EmailRecipientType[];
  bcc?: EmailRecipientType[];
  subject?: string;
  body?: string;
  attachments?: string[];
  priority: PriorityEnum;
  draftMessageId?: string;
};

type HttpPutAttachmentUploadRequestInputType = {
  fileName: string;
  mimeType: string;
}[];

type HttpPatchMessagesStatusRequestInputType = {
  messageIds: string[];
  isRead: boolean;
};

export { HttpPostSendMailInputType, HttpPutAttachmentUploadRequestInputType, HttpPatchMessagesStatusRequestInputType };
