import { Schema, model, Model } from 'mongoose';
import { MongoCollection } from '../../enums';
import {
  OBNotificationRedirectionSchemaType,
  OBNotificationSchemaType,
  OBNotificationUserSchemaType,
} from '../../types';

const OBNotificationRedirectionSchema = new Schema<OBNotificationRedirectionSchemaType>(
  {
    screenName: { type: String, required: true },
    data: { type: JSON },
  },
  { _id: false },
);

const OBNotificationUserSchema = new Schema<OBNotificationUserSchemaType>(
  {
    employeePsId: { type: String },
    displayName: { type: String },
  },
  { _id: false },
);

const notificationSchema = new Schema<OBNotificationSchemaType>({
  notificationId: { type: String, required: true },
  priority: { type: String, required: true },
  expiresAt: { type: Date },
  notificationPlacements: { type: [String], required: true },
  redirectionScreen: { type: OBNotificationRedirectionSchema },
  notificationVisibility: { type: String, required: true },
  notificationType: { type: String, required: true },
  notificationStatus: { type: String, required: true },
  notificationOrigin: { type: String, required: true },
  notificationTitle: { type: String, required: true },
  notificationBody: { type: String, required: true },
  userPsIds: { type: [String] },
  branchIds: { type: [String] },
  divisionIds: { type: [String] },
  provincialCodes: { type: [String] },
  audienceLevel: { type: String, required: true },
  description: { type: String },
  validFrom: { type: Date, required: true, default: Date.now },
  isClearable: { type: Boolean, default: true },
  isDeleted: { type: Boolean, required: true, default: false },
  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, required: true, default: Date.now },
  createdBy: { type: OBNotificationUserSchema },
});

notificationSchema.index(
  { notificationId: 1 },
  { unique: true, background: true, name: 'notification_notificationId_uniq_idx' },
);

notificationSchema.index(
  {
    notificationVisibility: 1,
    notificationPlacements: 1,
    priority: 1,
    notificationStatus: 1,
    notificationOrigin: 1,
    notificationType: 1,
    createdAt: -1,
  },
  {
    background: true,
    name: 'notification_notificationVisibility_notificationPlacements_priority_notificationStatus_notificationOrigin_notificationType_createdAt_idx',
  },
);

export const OBNotificationModel: Model<OBNotificationSchemaType> = model(
  MongoCollection.OneBayshoreNotificationCollection,
  notificationSchema,
);
