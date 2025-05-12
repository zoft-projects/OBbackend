import {
  AudienceEnum,
  InteractionTypeEnum,
  NotificationOriginEnum,
  NotificationPlacementEnum,
  NotificationStatusEnum,
  NotificationTypeEnum,
  PriorityEnum,
  ProvincialCodesEnum,
  ScreenEnum,
} from '../../enums';
import {
  HttpPOSTCreateNotification,
  NotificationPayloadType,
  NotificationUpsertOperationType,
  OBNotificationInteractionSchemaType,
  NotificationInteractionUpsertOperationType,
  OBNotificationSchemaType,
} from '../../types';
import { addDays } from '../../utils';

const mapNotificationApiRequestToServiceRequest = (
  requestData: HttpPOSTCreateNotification,
): NotificationUpsertOperationType => {
  const {
    notificationTitle,
    notificationBody,
    notificationType,
    description,
    notificationVisibility,
    branchIds,
    divisionIds,
    provincialCodes,
    priority,
    validFrom,
    notificationStatus,
    notificationOrigin,
    isDeleted,
    expiresInDays,
    createdBy,
    redirectionScreen,
    redirectionScreenProps,
  } = requestData;
  const mappedNotification: Partial<NotificationUpsertOperationType> = {};

  if (notificationTitle) {
    mappedNotification.notificationTitle = notificationTitle;
  }

  if (notificationBody) {
    mappedNotification.notificationBody = notificationBody;
  }

  if (notificationType in NotificationTypeEnum) {
    mappedNotification.notificationType = notificationType;
  }

  if (description) {
    mappedNotification.description = description;
  }

  if (notificationVisibility in AudienceEnum) {
    mappedNotification.notificationVisibility = notificationVisibility;
    mappedNotification.audienceLevel = notificationVisibility;
  }

  if (Array.isArray(branchIds) && branchIds.length > 0) {
    mappedNotification.branchIds = branchIds;
  }

  if (Array.isArray(provincialCodes) && provincialCodes.length > 0) {
    const validProvincialCodes: ProvincialCodesEnum[] = [];

    provincialCodes.forEach((provincialCode) => {
      if (provincialCode in ProvincialCodesEnum) {
        validProvincialCodes.push(provincialCode as ProvincialCodesEnum);
      }
    });

    mappedNotification.provincialCodes = validProvincialCodes;
  }

  if (Array.isArray(divisionIds) && divisionIds.length > 0) {
    mappedNotification.divisionIds = divisionIds;
  }

  if (priority in PriorityEnum) {
    mappedNotification.priority = priority as PriorityEnum;
    const priorityToPlacementMapping = {
      [PriorityEnum.Low]: [NotificationPlacementEnum.UserQueue],
      [PriorityEnum.Medium]: [NotificationPlacementEnum.Dashboard],
      [PriorityEnum.High]: [NotificationPlacementEnum.Dashboard, NotificationPlacementEnum.UserQueue],
      [PriorityEnum.Highest]: [
        NotificationPlacementEnum.Dashboard,
        NotificationPlacementEnum.UserQueue,
        NotificationPlacementEnum.Push,
      ],
    };
    mappedNotification.notificationPlacements = priorityToPlacementMapping[priority];
  }

  if (notificationOrigin in NotificationOriginEnum) {
    mappedNotification.notificationOrigin = notificationOrigin as NotificationOriginEnum;
  }

  if (validFrom) {
    mappedNotification.validFrom = new Date(validFrom);
  }

  mappedNotification.createdAt = new Date();

  if (typeof isDeleted === 'boolean') {
    mappedNotification.isDeleted = isDeleted;
  }

  if (notificationStatus in NotificationStatusEnum) {
    mappedNotification.notificationStatus = notificationStatus as NotificationStatusEnum;
  }

  if (typeof expiresInDays === 'number' && expiresInDays > 0) {
    mappedNotification.expiresAt = addDays(new Date(), expiresInDays);
  }

  if (createdBy?.displayName && createdBy.employeePsId) {
    mappedNotification.createdBy = createdBy;
  }

  if (Object.values(ScreenEnum).includes(redirectionScreen) && redirectionScreenProps) {
    mappedNotification.redirectionScreen = redirectionScreen as ScreenEnum;
    mappedNotification.redirectionScreenProps = redirectionScreenProps;
  }

  return mappedNotification as NotificationUpsertOperationType;
};

const mapDbNotificationsToApiPayload = (obNotification: OBNotificationSchemaType): NotificationPayloadType => {
  const { notificationId, notificationTitle, notificationBody, notificationStatus, priority } = obNotification;

  const mappedNotifications: Partial<NotificationPayloadType> = {
    notificationId,
    notificationTitle,
    notificationBody,
    notificationStatus,
    priority,
  };

  if (obNotification.expiresAt) {
    mappedNotifications.expiresAt = obNotification.expiresAt;
  }

  if (obNotification.description) {
    mappedNotifications.description = obNotification.description;
  }

  if (obNotification.redirectionScreen?.screenName) {
    mappedNotifications.redirectionScreen = {
      screenName: obNotification.redirectionScreen.screenName,
      data: obNotification.redirectionScreen.data,
    };
  }

  return mappedNotifications as NotificationPayloadType;
};

const mapNotificationInteractionRequestToDBRecord = (
  notificationInteractionData: Partial<NotificationInteractionUpsertOperationType>,
): Partial<OBNotificationInteractionSchemaType> => {
  const mappedNotificationInteraction: Partial<OBNotificationInteractionSchemaType> = {
    notificationId: notificationInteractionData.notificationId,
  };

  if (
    notificationInteractionData.interactionType &&
    notificationInteractionData.interactionType in InteractionTypeEnum
  ) {
    mappedNotificationInteraction.interactionType = notificationInteractionData.interactionType as InteractionTypeEnum;
  }

  if (notificationInteractionData.interactedUserPsId) {
    mappedNotificationInteraction.interactedUserPsId = notificationInteractionData.interactedUserPsId;
  }

  if (notificationInteractionData.userDisplayName) {
    mappedNotificationInteraction.userDisplayName = notificationInteractionData.userDisplayName;
  }

  if (notificationInteractionData.userImageLink) {
    mappedNotificationInteraction.userImageLink = notificationInteractionData.userImageLink;
  }

  return mappedNotificationInteraction as OBNotificationInteractionSchemaType;
};

export {
  mapNotificationApiRequestToServiceRequest,
  mapDbNotificationsToApiPayload,
  mapNotificationInteractionRequestToDBRecord,
};
