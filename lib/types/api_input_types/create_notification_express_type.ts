import {
  AudienceEnum,
  InteractionTypeEnum,
  NotificationOriginEnum,
  NotificationStatusEnum,
  NotificationTypeEnum,
  ProvincialCodesEnum,
  ScreenEnum,
} from '../../enums';
import { OBNotificationUserSchemaType } from '../models_types/notification_model_type';
import { JSONLikeType } from '../models_types/temp_data_model_type';

type HttpPOSTCreateNotification = {
  notificationTitle: string;
  description?: string;
  notificationBody: string;
  notificationType: NotificationTypeEnum;
  notificationVisibility: AudienceEnum;
  branchIds?: string[];
  divisionIds?: string[];
  provincialCodes?: ProvincialCodesEnum[];
  notificationStatus?: NotificationStatusEnum;
  notificationOrigin: NotificationOriginEnum;
  priority?: string;
  validFrom?: string;
  expiresInDays?: number;
  isDeleted?: boolean;
  createdBy?: OBNotificationUserSchemaType;
  redirectionScreen?: ScreenEnum;
  redirectionScreenProps?: JSONLikeType;
};

type HttpPOSTNotificationInteraction = {
  notificationId: string;
  interactionType: InteractionTypeEnum;
};

export { HttpPOSTCreateNotification, HttpPOSTNotificationInteraction };
