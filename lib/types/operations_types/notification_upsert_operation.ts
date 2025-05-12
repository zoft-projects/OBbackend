import { JSONLikeType, OBNotificationUserSchemaType } from '..';
import {
  PriorityEnum,
  ScreenEnum,
  AudienceEnum,
  NotificationOriginEnum,
  NotificationPlacementEnum,
  NotificationTypeEnum,
  InteractionTypeEnum,
  ProvincialCodesEnum,
  NotificationStatusEnum,
} from '../../enums';

type NotificationUpsertOperationType = {
  notificationId?: string;
  priority: PriorityEnum;
  expiresAt?: Date;
  notificationPlacements: NotificationPlacementEnum[];
  redirectionScreen?: ScreenEnum;
  redirectionScreenProps?: JSONLikeType;
  notificationVisibility: AudienceEnum;
  notificationType: NotificationTypeEnum;
  notificationOrigin: NotificationOriginEnum;
  notificationTitle: string;
  notificationBody: string;
  userPsIds?: string[];
  branchIds?: string[];
  divisionIds?: string[];
  provincialCodes?: ProvincialCodesEnum[];
  audienceLevel: AudienceEnum;
  description?: string;
  validFrom?: Date;
  notificationStatus?: NotificationStatusEnum;
  createdAt?: Date;
  updatedAt?: Date;
  createdBy?: OBNotificationUserSchemaType;
  isDeleted?: boolean;
  isClearable?: boolean;
};

type NotificationInteractionUpsertOperationType = {
  notificationId: string;
  interactionType: InteractionTypeEnum;
  interactedUserPsId: string;
  userDisplayName?: string;
  userImageLink?: string;
};

type BasicNotificationType = {
  title: string;
  body: string;
  redirectionScreen?: ScreenEnum;
  redirectionScreenProps?: JSONLikeType;
};

export { NotificationUpsertOperationType, NotificationInteractionUpsertOperationType, BasicNotificationType };
