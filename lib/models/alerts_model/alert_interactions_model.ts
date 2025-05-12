import { Schema, model } from 'mongoose';

import { MongoCollection } from '../../enums/mongo_collections_enum';

import { OBAlertInteractionSchemaType, OBAlertUserSchemaType } from '../../types';

const OBAlertUserInteractedSchema = new Schema<OBAlertUserSchemaType>(
  {
    employeePsId: { type: String, required: true },
    displayName: { type: String },
    userImageLink: { type: String },
  },
  { _id: false },
);

const oneBayshoreAlertInteractionSchema = new Schema<OBAlertInteractionSchemaType>({
  alertId: { type: String, required: true },
  interactionType: { type: String, required: true },
  interactedUser: { type: OBAlertUserInteractedSchema, required: true },
  interactedAt: { type: Date, required: true },
  isDeleted: { type: Boolean, required: true, default: false },
  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, required: true, default: Date.now },
});

oneBayshoreAlertInteractionSchema.index({ alertId: 1 }, { unique: true, background: true, name: 'alertId_uniq_idx' });

export const OBAlertInteractionModel = model<OBAlertInteractionSchemaType>(
  MongoCollection.OneBayshoreAlertInteractionCollection,
  oneBayshoreAlertInteractionSchema,
);
