import { MessageDirectionEnum, MessageStatusEnum, PriorityEnum } from '../../enums';

type EmailRecipientType = {
  displayName: string;
  email: string;
};

type MessagePayloadType = {
  messageId: string;
  from: EmailRecipientType;
  to: EmailRecipientType[];
  subject?: string;
  bodyPreview?: string;
  dateReceived: string;
  priority: PriorityEnum;
  isRead: boolean;
  hasAttachments: boolean;
};

type MessageDetailsPayloadType = {
  messageId: string;
  employeeId: string;
  messageDirection?: MessageDirectionEnum;
  from: EmailRecipientType;
  to: EmailRecipientType[];
  cc?: EmailRecipientType[];
  bcc?: EmailRecipientType[];
  subject?: string;
  bodyText?: string;
  bodyHtml?: string;
  bodyLink?: string;
  dateCreated: string;
  priority: PriorityEnum;
  status: MessageStatusEnum;
  isRead: boolean;
  attachments?: {
    fileName?: string;
    mimeType?: string;
    fileSize?: number;
    fileUrl: string;
  }[];
  parentMessageId?: string;
};

type DraftMessagePayloadType = {
  draftMessageId?: string;
  to: EmailRecipientType[];
  cc?: EmailRecipientType[];
  bcc?: EmailRecipientType[];
  subject?: string;
  body?: string;
  priority?: PriorityEnum;
  attachments?: string[];
};

type AttachmentUploadUrlPayloadType = {
  fileName: string;
  uploadUrl: string;
}[];

type MailContactInfoPayloadType = {
  employeePsId: string;
  displayName: string;
  email: string;
  profileImageUrl?: string;
};

export {
  MessagePayloadType,
  MessageDetailsPayloadType,
  AttachmentUploadUrlPayloadType,
  DraftMessagePayloadType,
  MailContactInfoPayloadType,
};
