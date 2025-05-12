import { Schema, model } from 'mongoose';

import { MongoCollection } from '../../enums/mongo_collections_enum';

import { OBAlertUserSchemaType, OBAlertsSchemaType } from '../../types';

const OBAlertUserSchema = new Schema<OBAlertUserSchemaType>(
  {
    employeePsId: { type: String, required: true },
    displayName: { type: String },
    userImageLink: { type: String },
  },
  { _id: false },
);

const oneBayshoreAlertsSchema = new Schema<OBAlertsSchemaType>({
  alertId: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  audienceLevel: { type: String, required: true },
  branchIds: { type: [String] },
  divisionIds: { type: [String] },
  provincialCodes: { type: [String] },
  accessLevelNames: { type: [String], required: true },
  status: { type: String, required: true },
  priority: { type: String, required: true },
  validFrom: { type: Date, required: true, default: Date.now },
  expiresAt: { type: Date },
  isDeleted: { type: Boolean, required: true, default: false },
  createdBy: { type: OBAlertUserSchema, required: true },
  updatedBy: { type: OBAlertUserSchema },
  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, required: true, default: Date.now },
});

oneBayshoreAlertsSchema.index({ alertId: 1 }, { unique: true, background: true, name: 'alertId_uniq_idx' });

oneBayshoreAlertsSchema.index(
  { audienceLevel: 1, accessLevelNames: 1, status: 1, createdAt: -1 },
  { background: true, name: 'alertAudienceLevel_accessLevels_status_createdAt_idx' },
);

export const OBAlertsModel = model<OBAlertsSchemaType>(
  MongoCollection.OneBayshoreAlertsCollection,
  oneBayshoreAlertsSchema,
);
