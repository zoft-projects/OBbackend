import { JSONLikeType } from '..';
import {
  NotificationStatusEnum,
  NotificationOriginEnum,
  NotificationPlacementEnum,
  PriorityEnum,
  ScreenEnum,
  AudienceEnum,
  NotificationTypeEnum,
  InteractionTypeEnum,
  ProvincialCodesEnum,
} from '../../enums';

type OBNotificationRedirectionSchemaType = {
  screenName: ScreenEnum;
  data?: JSONLikeType;
};

type OBNotificationSchemaType = {
  id?: string;
  notificationId: string;
  priority: PriorityEnum;
  expiresAt?: Date;
  notificationPlacements: NotificationPlacementEnum[];
  redirectionScreen?: OBNotificationRedirectionSchemaType;
  notificationVisibility: AudienceEnum;
  notificationType: NotificationTypeEnum;
  notificationStatus: NotificationStatusEnum;
  notificationOrigin: NotificationOriginEnum;
  notificationTitle: string;
  notificationBody: string;
  audienceLevel: AudienceEnum;
  userPsIds?: string[];
  branchIds?: string[];
  divisionIds?: string[];
  provincialCodes?: ProvincialCodesEnum[];
  validFrom?: Date;
  description?: string;
  isClearable?: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: OBNotificationUserSchemaType;
};

type OBNotificationInteractionSchemaType = {
  id?: string;
  notificationId: string;
  interactionType: InteractionTypeEnum;
  interactedUserPsId: string;
  userDisplayName?: string;
  userImageLink?: string;
  interactedAt: Date;
  isDeleted: boolean;
};

type OBNotificationUserSchemaType = {
  employeePsId?: string;
  displayName?: string;
};

export {
  OBNotificationSchemaType,
  OBNotificationRedirectionSchemaType,
  OBNotificationInteractionSchemaType,
  OBNotificationUserSchemaType,
};
