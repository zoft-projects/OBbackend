import {
  AudienceEnum,
  MessageDirectionEnum,
  MessageStatusEnum,
  NotificationOriginEnum,
  NotificationPlacementEnum,
  NotificationTypeEnum,
  PriorityEnum,
  ScreenEnum,
  UserLevelEnum,
} from '../../enums';
import {
  MailNotificationConsumerType,
  NotificationUpsertOperationType,
  MessagePayloadType,
  MailPreviewFromSystemType,
  MessageDetailsPayloadType,
  SendEmailToSystemType,
  HttpPostSendMailInputType,
  DraftMessagePayloadType,
  MailDetailsPreviewFromSystemType,
  MailContactInfoPayloadType,
  OBUserSchemaType,
} from '../../types';

const mapDBMailMessageToApiPayload = (emailMessage: MailPreviewFromSystemType): MessagePayloadType => {
  const mappedMessage: Partial<MessagePayloadType> = {
    messageId: emailMessage.id,
    from: {
      displayName: emailMessage?.from?.name || '',
      email: emailMessage.from.emailAddress,
    },
    to: [],
    subject: emailMessage.subject || '',
    priority: emailMessage.isPriority ? PriorityEnum.High : PriorityEnum.Medium,
    isRead: emailMessage.isRead ?? false,
    hasAttachments: emailMessage.hasAttachments ?? false,
    dateReceived: emailMessage.dateReceived,
    bodyPreview: emailMessage.bodyPreview ?? '',
  };

  if (Array.isArray(emailMessage.to) && emailMessage.to.length > 0) {
    emailMessage.to.forEach(({ name, emailAddress }) => {
      if (emailAddress) {
        mappedMessage.to.push({
          email: emailAddress,
          displayName: name || '',
        });
      }
    });
  }

  return mappedMessage as MessagePayloadType;
};

const mapDBMailMessageDetailsToApiPayload = (
  emailMessage: MailDetailsPreviewFromSystemType,
): MessageDetailsPayloadType => {
  const mappedMessage: Partial<MessageDetailsPayloadType> = {
    messageId: emailMessage.id,
    from: {
      displayName: emailMessage.from.name || '',
      email: emailMessage.from.emailAddress,
    },
    subject: emailMessage.subject || '',
    bodyHtml: emailMessage.bodyHtml || '',
    bodyText: emailMessage.bodyText || '',
    priority: emailMessage.isPriority ? PriorityEnum.High : PriorityEnum.Medium,
  };

  if (typeof emailMessage.isRead === 'boolean') {
    mappedMessage.isRead = emailMessage.isRead;
  } else {
    mappedMessage.isRead = false;
  }

  if (emailMessage?.dateCreated) {
    mappedMessage.dateCreated = emailMessage.dateCreated;
  }

  if (emailMessage && emailMessage.messageDirection in MessageDirectionEnum) {
    mappedMessage.messageDirection = emailMessage.messageDirection;
  }

  if (emailMessage && emailMessage.status in MessageStatusEnum) {
    mappedMessage.status = emailMessage.status;
  }

  mappedMessage.to = [];
  if (Array.isArray(emailMessage.to) && emailMessage.to.length > 0) {
    emailMessage.to.forEach(({ name, emailAddress }) => {
      if (emailAddress) {
        mappedMessage.to.push({
          email: emailAddress,
          displayName: name || '',
        });
      }
    });
  }

  mappedMessage.cc = [];
  if (Array.isArray(emailMessage.cc) && emailMessage.cc.length > 0) {
    emailMessage.cc.forEach(({ name, emailAddress }) => {
      if (emailAddress) {
        mappedMessage.cc.push({
          email: emailAddress,
          displayName: name || '',
        });
      }
    });
  }

  mappedMessage.bcc = [];
  if (Array.isArray(emailMessage.bcc) && emailMessage.bcc.length > 0) {
    emailMessage.bcc.forEach(({ name, emailAddress }) => {
      if (emailAddress) {
        mappedMessage.bcc.push({
          email: emailAddress,
          displayName: name || '',
        });
      }
    });
  }

  mappedMessage.attachments = [];
  if (Array.isArray(emailMessage.attachments) && emailMessage.attachments.length > 0) {
    emailMessage.attachments.forEach(({ downloadUrl, fileName, mimeType, fileSize }) => {
      if (downloadUrl) {
        mappedMessage.attachments.push({
          fileUrl: downloadUrl,
          fileName: fileName || '',
          mimeType: mimeType || '',
          fileSize: fileSize || 0,
        });
      }
    });
  }

  return mappedMessage as MessageDetailsPayloadType;
};

const mapMailNotificationApiRequestToServiceRequest = (
  mailNotification: MailNotificationConsumerType,
): NotificationUpsertOperationType => {
  const mappedNotification = {
    notificationPlacements: [NotificationPlacementEnum.Push],
    notificationVisibility: AudienceEnum.Individual,
    notificationType: NotificationTypeEnum.Individual,
    notificationOrigin: NotificationOriginEnum.System,
    audienceLevel: AudienceEnum.Individual,
    notificationTitle: mailNotification.subject ?? 'New Mail',
    notificationBody: mailNotification.text ?? '1 mail received',
    priority: mailNotification.isPriority === true ? PriorityEnum.High : PriorityEnum.Medium,
  } as Partial<NotificationUpsertOperationType>;

  if (mailNotification.employeePsId) {
    mappedNotification.userPsIds = [mailNotification.employeePsId];
  }

  if (mailNotification.messageId) {
    mappedNotification.redirectionScreen = ScreenEnum.MailDetailViewScreen;
    mappedNotification.redirectionScreenProps = {
      messageId: mailNotification.messageId,
    };
  } else {
    mappedNotification.redirectionScreen = ScreenEnum.MailInboxListScreen;
  }

  return mappedNotification as NotificationUpsertOperationType;
};

const mapSendMailApiRequestToServiceRequest = (mailInput: HttpPostSendMailInputType): SendEmailToSystemType => {
  const mappedMailRequest: SendEmailToSystemType = {
    to: [],
    cc: [],
    bcc: [],
    subject: mailInput.subject || '',
    bodyHtml: mailInput.body || '',
    isPriority: [PriorityEnum.High, PriorityEnum.Highest].includes(mailInput.priority),
  };

  if (Array.isArray(mailInput.to) && mailInput.to.length > 0) {
    mappedMailRequest.to = mailInput.to.map((recipient) => ({
      name: recipient.displayName || '',
      emailAddress: recipient.email,
    }));
  }

  if (Array.isArray(mailInput.cc) && mailInput.cc.length > 0) {
    mappedMailRequest.cc = mailInput.cc.map((recipient) => ({
      name: recipient.displayName || '',
      emailAddress: recipient.email,
    }));
  }

  if (Array.isArray(mailInput.bcc) && mailInput.bcc.length > 0) {
    mappedMailRequest.bcc = mailInput.bcc.map((recipient) => ({
      name: recipient.displayName || '',
      emailAddress: recipient.email,
    }));
  }

  if (Array.isArray(mailInput.attachments) && mailInput.attachments.length > 0) {
    mappedMailRequest.attachments = mailInput.attachments;
  }

  return mappedMailRequest;
};

const mapDraftMailApiRequestToServiceRequest = (mailInput: HttpPostSendMailInputType): DraftMessagePayloadType => {
  const mappedMailRequest: DraftMessagePayloadType = {
    draftMessageId: mailInput.draftMessageId || '',
    to: [],
    cc: [],
    bcc: [],
    subject: mailInput.subject || '',
    body: mailInput.body || '',
  };

  if (Array.isArray(mailInput.to) && mailInput.to.length > 0) {
    mappedMailRequest.to = mailInput.to.map((recipient) => ({
      displayName: recipient.displayName || '',
      email: recipient.email,
    }));
  }

  if (Array.isArray(mailInput.cc) && mailInput.cc.length > 0) {
    mappedMailRequest.cc = mailInput.cc.map((recipient) => ({
      displayName: recipient.displayName || '',
      email: recipient.email,
    }));
  }

  if (Array.isArray(mailInput.bcc) && mailInput.bcc.length > 0) {
    mappedMailRequest.bcc = mailInput.bcc.map((recipient) => ({
      displayName: recipient.displayName || '',
      email: recipient.email,
    }));
  }

  if (Array.isArray(mailInput.attachments) && mailInput.attachments.length > 0) {
    mappedMailRequest.attachments = mailInput.attachments;
  }

  if (mailInput.priority && mailInput.priority in PriorityEnum) {
    mappedMailRequest.priority = mailInput.priority;
  }

  return mappedMailRequest;
};

const mapDBMailContactToApiPayload = (
  user: OBUserSchemaType,
  mailDomainForFieldStaff?: string,
): MailContactInfoPayloadType => {
  const { employeePsId, displayName, workEmail } = user;

  const mappedMailContact: MailContactInfoPayloadType = {
    employeePsId,
    displayName,
    email: workEmail,
    profileImageUrl: '',
  };

  const isFieldStaff = user.obAccess.name === UserLevelEnum.FIELD_STAFF;

  if (workEmail && isFieldStaff && mailDomainForFieldStaff) {
    const [username] = workEmail.split('@');

    mappedMailContact.email = `${username}@${mailDomainForFieldStaff}`;
  }

  return mappedMailContact as MailContactInfoPayloadType;
};

export {
  mapMailNotificationApiRequestToServiceRequest,
  mapDBMailMessageToApiPayload,
  mapDBMailMessageDetailsToApiPayload,
  mapSendMailApiRequestToServiceRequest,
  mapDraftMailApiRequestToServiceRequest,
  mapDBMailContactToApiPayload,
};
