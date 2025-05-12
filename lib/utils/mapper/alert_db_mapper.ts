import { AudienceEnum, InteractionTypeEnum, PriorityEnum, ProvincialCodesEnum, UserLevelEnum } from '../../enums';
import {
  HttpPOSTCreateOBAlert,
  OBAlertsSchemaType,
  OBAlertUpsertOperationType,
  OBAlertStatus,
  HttpPOSTAlertInteraction,
  OBAlertInteractionSchemaType,
  OBAlertInteractionOperationType,
  AlertPayloadType,
  OBNotificationSchemaType,
} from '../../types';
import { mapAccessLevelToName, addDays } from '../../utils';

const mapAlertRequestToDBRecord = (alert: OBAlertUpsertOperationType): OBAlertsSchemaType => {
  const mappedAlert: Partial<OBAlertsSchemaType> = {
    alertId: alert.alertId,
  };
  if (alert.title) {
    mappedAlert.title = alert.title;
  }

  if (alert.description) {
    mappedAlert.description = alert.description;
  }

  if (alert.audienceLevel in AudienceEnum) {
    mappedAlert.audienceLevel = alert.audienceLevel as AudienceEnum;
  }

  if (Array.isArray(alert.branchIds) && alert.branchIds.length > 0) {
    mappedAlert.branchIds = alert.branchIds;
  }
  if (Array.isArray(alert.provincialCodes) && alert.provincialCodes.length > 0) {
    const validProvincialCodes: ProvincialCodesEnum[] = [];

    alert.provincialCodes.forEach((provincialCode) => {
      if (provincialCode in ProvincialCodesEnum) {
        validProvincialCodes.push(provincialCode as ProvincialCodesEnum);
      }
    });

    mappedAlert.provincialCodes = validProvincialCodes;
  }

  if (Array.isArray(alert.accessLevelNames) && alert.accessLevelNames.length > 0) {
    mappedAlert.accessLevelNames = alert.accessLevelNames.map((level) => level as UserLevelEnum);
  }

  if (Array.isArray(alert.divisionIds) && alert.divisionIds.length > 0) {
    mappedAlert.divisionIds = alert.divisionIds;
  }

  if (alert.status in OBAlertStatus) {
    mappedAlert.status = alert.status as OBAlertStatus;
  } else {
    mappedAlert.status = OBAlertStatus.Inactive; // default status
  }

  if (alert.priority && alert.priority in PriorityEnum) {
    mappedAlert.priority = alert.priority;
  } else {
    mappedAlert.priority = PriorityEnum.Medium;
  }

  if (alert.validFrom) {
    mappedAlert.validFrom = new Date(alert.validFrom);
  }

  if (alert.expiresAt) {
    mappedAlert.expiresAt = new Date(alert.expiresAt);
  }

  if (alert.createdBy) {
    mappedAlert.createdBy = {
      employeePsId: alert.createdBy.employeePsId,
      displayName: alert.createdBy.displayName,
      userImageLink: alert.createdBy.userImageLink,
    };
  }
  if (alert.createdAt) {
    mappedAlert.createdAt = new Date(alert.createdAt);
  }

  if (alert.updatedAt) {
    mappedAlert.updatedAt = new Date(alert.updatedAt);
  }

  if (alert.isDeleted) {
    mappedAlert.isDeleted = alert.isDeleted;
  }

  return mappedAlert as OBAlertsSchemaType;
};

const mapAlertApiRequestToServiceRequest = (requestData: HttpPOSTCreateOBAlert): OBAlertUpsertOperationType => {
  const {
    title,
    description,
    audienceLevel,
    branchIds,
    divisionIds,
    provincialCodes,
    jobLevels,
    priority,
    validFrom,
    expiresInDays,
    createdById,
    createdByName,
    createdAt,
    updatedAt,
    isDeleted,
    status,
  } = requestData;
  const mappedAlert: Partial<OBAlertUpsertOperationType> = {};

  if (title) {
    mappedAlert.title = title;
  }

  if (description) {
    mappedAlert.description = description;
  }

  if (audienceLevel in AudienceEnum) {
    mappedAlert.audienceLevel = audienceLevel;
  }

  if (Array.isArray(branchIds) && branchIds.length > 0) {
    mappedAlert.branchIds = branchIds;
  }

  if (Array.isArray(provincialCodes) && provincialCodes.length > 0) {
    const validProvincialCodes: ProvincialCodesEnum[] = [];

    provincialCodes.forEach((provincialCode) => {
      if (provincialCode in ProvincialCodesEnum) {
        validProvincialCodes.push(provincialCode as ProvincialCodesEnum);
      }
    });

    mappedAlert.provincialCodes = validProvincialCodes;
  }
  if (Array.isArray(jobLevels) && jobLevels.length > 0) {
    mappedAlert.accessLevelNames = [...new Set(jobLevels.map((jobLevel) => mapAccessLevelToName(jobLevel)))];
  }

  if (Array.isArray(divisionIds) && divisionIds.length > 0) {
    mappedAlert.divisionIds = divisionIds;
  }

  if (priority && priority in PriorityEnum) {
    mappedAlert.priority = priority as PriorityEnum;
  }

  if (validFrom) {
    mappedAlert.validFrom = new Date(validFrom);
  }

  if (expiresInDays) {
    const date = new Date();
    mappedAlert.expiresAt = addDays(new Date(), expiresInDays);
    mappedAlert.expiresAt = date;
  }
  if (createdAt) {
    mappedAlert.createdAt = new Date(createdAt);
  }
  if (updatedAt) {
    mappedAlert.updatedAt = new Date(updatedAt);
  }
  if (createdById) {
    mappedAlert.createdBy = {
      employeePsId: createdById,
      displayName: createdByName,
    };
  }

  if (isDeleted) {
    mappedAlert.isDeleted = isDeleted;
  }

  if (status && status in OBAlertStatus) {
    mappedAlert.status = status as OBAlertStatus;
  }

  return mappedAlert as OBAlertUpsertOperationType;
};

const mapDbNotificationToDbAlert = (obNotification: OBNotificationSchemaType): OBAlertsSchemaType => {
  const notification = {
    alertId: obNotification.notificationId,
    title: obNotification.notificationTitle,
    description: obNotification.notificationBody,
    audienceLevel: obNotification.audienceLevel,
    branchIds: obNotification.branchIds,
    divisionIds: obNotification.divisionIds,
    provincialCodes: obNotification.provincialCodes,
    priority: obNotification.priority,
    isDeleted: obNotification.isDeleted,
    createdBy: obNotification.createdBy,
    validFrom: obNotification.validFrom,
    createdAt: obNotification.createdAt,
    placements: obNotification.notificationPlacements ?? [],
  } as OBAlertsSchemaType;
  if (obNotification?.redirectionScreen) {
    notification.redirectionScreen = obNotification?.redirectionScreen;
  }

  return notification;
};

const mapDbNotificationToAlertApiPayload = (obNotification: OBNotificationSchemaType): Partial<AlertPayloadType> => {
  const mappedAlert: Partial<AlertPayloadType> = {
    alertId: obNotification.notificationId,
    alertTitle: obNotification.notificationTitle,
  };

  if (obNotification.description) {
    mappedAlert.alertDescription = obNotification.notificationBody;
  }

  if (obNotification.notificationVisibility) {
    mappedAlert.alertTag = obNotification.notificationVisibility;
  }

  if (obNotification.createdAt) {
    mappedAlert.alertCreatedDate = new Date(obNotification.createdAt);
  }

  if (obNotification.createdBy) {
    mappedAlert.alertCreatedBy = {
      employeePsId: obNotification.createdBy.employeePsId,
      displayName: obNotification.createdBy.displayName,
    };
  }

  if (obNotification.expiresAt) {
    mappedAlert.alertExpiresAtDate = new Date(obNotification.expiresAt);
  }

  return mappedAlert as AlertPayloadType;
};

const mapDBAlertToApiPayload = (obAlert: OBAlertsSchemaType): Partial<AlertPayloadType> => {
  const mappedAlert: Partial<AlertPayloadType> = {
    alertId: obAlert.alertId,
    alertTitle: obAlert.title,
  };

  if (obAlert.description) {
    mappedAlert.alertDescription = obAlert.description;
  }

  if (obAlert.accessLevelNames) {
    mappedAlert.alertTag = obAlert.audienceLevel;
  }

  if (obAlert.createdBy) {
    mappedAlert.alertCreatedBy = {
      employeePsId: obAlert.createdBy.employeePsId,
      displayName: obAlert.createdBy.displayName,
      userImageLink: obAlert.createdBy.userImageLink,
    };
  }

  if (obAlert.createdAt) {
    mappedAlert.alertCreatedDate = new Date(obAlert.createdAt);
  }

  if (obAlert.expiresAt) {
    mappedAlert.alertExpiresAtDate = new Date(obAlert.expiresAt);
  }

  return mappedAlert as AlertPayloadType;
};

const mapAlertInteractionRequestToServiceRequest = (
  requestData: HttpPOSTAlertInteraction,
): OBAlertInteractionOperationType => {
  const { alertId, interactionType, interactedUserId } = requestData;

  const mappedPayload: Partial<OBAlertInteractionOperationType> = { alertId };

  if (interactionType && interactionType in InteractionTypeEnum) {
    mappedPayload.interactionType = interactionType as InteractionTypeEnum;
  }

  // TODO remove after migration
  if (interactedUserId) {
    mappedPayload.interactedUserPsId = interactedUserId;
  }

  return mappedPayload as OBAlertInteractionOperationType;
};

const mapAlertInteractionRequestToDBRecord = (
  alertInteractionData: Partial<OBAlertInteractionOperationType>,
): Partial<OBAlertInteractionSchemaType> => {
  const mappedAlertInteracted: Partial<OBAlertInteractionSchemaType> = {
    alertId: alertInteractionData.alertId,
  };

  if (alertInteractionData.interactionType && alertInteractionData.interactionType in InteractionTypeEnum) {
    mappedAlertInteracted.interactionType = alertInteractionData.interactionType as InteractionTypeEnum;
  }

  if (alertInteractionData.interactedUserPsId) {
    mappedAlertInteracted.interactedUser.employeePsId = alertInteractionData.interactedUserPsId;
  }
  if (alertInteractionData.interactedUserName) {
    mappedAlertInteracted.interactedUser.displayName = alertInteractionData.interactedUserName;
  }

  if (alertInteractionData.interactedUserImage) {
    mappedAlertInteracted.interactedUser.userImageLink = alertInteractionData.interactedUserImage;
  }

  return mappedAlertInteracted as OBAlertInteractionSchemaType;
};

export {
  mapAlertRequestToDBRecord,
  mapAlertApiRequestToServiceRequest,
  mapDBAlertToApiPayload,
  mapAlertInteractionRequestToServiceRequest,
  mapAlertInteractionRequestToDBRecord,
  mapDbNotificationToAlertApiPayload,
  mapDbNotificationToDbAlert,
};
