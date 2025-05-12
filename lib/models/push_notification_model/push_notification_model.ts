import { Schema, model, Model } from 'mongoose';
import { MongoCollection } from '../../enums';
import { OBPushNotificationSchemaType } from '../../types';

const pushNotificationSchema = new Schema<OBPushNotificationSchemaType>({
  notificationId: { type: String, required: true },
  notificationMode: { type: String, required: true },
  notificationType: { type: String, required: true },
  notificationOrigin: { type: String, required: true },
  userPsId: { type: String, required: true },
  notificationTitle: { type: String, required: true },
  notificationBody: { type: String, required: true },
  notificationStatus: { type: String, required: true },
  description: { type: String, required: false },
  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, required: true, default: Date.now },
});

pushNotificationSchema.index(
  { userPsId: 1, notificationMode: 1 },
  { background: true, name: 'pushNotifications_userPsId_notificationMode_idx' },
);

export const OBPushNotificationModel: Model<OBPushNotificationSchemaType> = model(
  MongoCollection.OneBayshorePushNotificationCollection,
  pushNotificationSchema,
);
