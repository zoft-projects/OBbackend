import { MessageDirectionEnum, MessageStatusEnum } from '../../enums';

type MailUserConsumerType = {
  employeeId: string;
  emailAddress: string;
  bayshoreEmailAddress: string;
  bayshoreUserId: string;
  firstName: string;
  lastName: string;
  dateCreated: Date;
  isActive: boolean;
  status: string;
  previousUserRecord: boolean;
};

type EmailRecipientType = {
  name: string;
  emailAddress: string;
};

type SendMailResponseFromSystemType = {
  message?: string;
  data: MailPreviewFromSystemType;
};

type MailPreviewListFromSystemType = {
  total: number;
  pageSize: number;
  hasMore: boolean;
  results: MailPreviewFromSystemType[];
};

type MailPreviewFromSystemType = {
  id: string;
  from: EmailRecipientType;
  to: EmailRecipientType[];
  subject: string;
  bodyPreview: string;
  dateReceived: string;
  hasAttachments: boolean;
  isRead: boolean;
  isPriority: boolean;
};

type MailDetailsPreviewFromSystemType = {
  id: string;
  employeeId?: string;
  from: EmailRecipientType;
  to: EmailRecipientType[];
  subject: string;
  bodyText: string;
  bodyHtml: string;
  bodyLink?: string;
  messageDirection?: MessageDirectionEnum;
  dateCreated: string;
  isRead: boolean;
  isPriority: boolean;
  cc?: EmailRecipientType[];
  bcc?: EmailRecipientType[];
  status?: MessageStatusEnum;
  attachments?: {
    fileName?: string;
    mimeType?: string;
    fileSize?: number;
    s3Key?: string;
    downloadUrl?: string;
  }[];
};

type SendEmailToSystemType = {
  to: EmailRecipientType[];
  cc?: EmailRecipientType[];
  bcc?: EmailRecipientType[];
  subject: string;
  bodyHtml: string;
  isPriority?: boolean;
  attachments?: string[];
};

type AttachmentUploadUrlResponseFromSystemType = {
  fileName: string;
  s3UploadKey: string;
  s3UploadUrl: string;
}[];

type MailNotificationConsumerType = {
  employeePsId: string;
  messageId: string;
  subject: string;
  text: string;
  isPriority: boolean;
};

type UpdateMessagesStatusToSystemType = {
  messageIds: string[];
  isRead: boolean;
};

export {
  MailUserConsumerType,
  MailNotificationConsumerType,
  MailPreviewFromSystemType,
  SendEmailToSystemType,
  MailPreviewListFromSystemType,
  SendMailResponseFromSystemType,
  MailDetailsPreviewFromSystemType,
  AttachmentUploadUrlResponseFromSystemType,
  UpdateMessagesStatusToSystemType,
};
