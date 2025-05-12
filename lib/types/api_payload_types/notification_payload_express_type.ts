import { JSONLikeType } from '../models_types/temp_data_model_type';

type NotificationPayloadType = {
  notificationId: string;
  priority: string;
  expiresAt?: Date;
  redirectionScreen?: {
    screenName: string;
    data?: JSONLikeType;
  };
  notificationStatus: string;
  notificationTitle: string;
  notificationBody: string;
  description?: string;
};

export { NotificationPayloadType };
