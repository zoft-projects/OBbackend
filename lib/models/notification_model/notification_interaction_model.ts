import { Schema, model } from 'mongoose';
import { MongoCollection as MongoCollectionEnum } from '../../enums';
import { OBNotificationInteractionSchemaType } from '../../types';

const oneBayshoreNotificationInteractionSchema = new Schema<OBNotificationInteractionSchemaType>({
  notificationId: { type: String, required: true },
  interactionType: { type: String, required: true },
  interactedUserPsId: { type: String, required: true },
  userDisplayName: { type: String },
  userImageLink: { type: String },
  interactedAt: { type: Date, required: true, default: Date.now },
  isDeleted: { type: Boolean, required: true, default: false },
});

oneBayshoreNotificationInteractionSchema.index(
  { notificationId: 1, interactedUserPsId: 1, interactedAt: -1 },
  { background: true, name: 'notificationId_psId_interactedAt_idx' },
);

export const OBNotificationInteractionModel = model<OBNotificationInteractionSchemaType>(
  MongoCollectionEnum.OneBayshoreNotificationInteractionCollection,
  oneBayshoreNotificationInteractionSchema,
);
