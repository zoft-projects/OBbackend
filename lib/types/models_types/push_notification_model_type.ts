import {
  NotificationStatusEnum,
  NotificationPlacementEnum,
  NotificationTypeEnum,
  NotificationOriginEnum,
} from '../../enums';

type OBPushNotificationSchemaType = {
  id?: string;
  notificationId: string;
  notificationMode: NotificationPlacementEnum;
  notificationType: NotificationTypeEnum;
  notificationOrigin: NotificationOriginEnum;
  userPsId: string;
  notificationTitle: string;
  notificationBody: string;
  notificationStatus: NotificationStatusEnum;
  description?: string;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export { OBPushNotificationSchemaType };
