import { Schema, model, Model } from 'mongoose';
import { MongoCollection } from '../../enums';
import { OBPrerequisiteAcceptanceSchemaType } from '../../types';

const oneBayshorePrerequisiteAcceptanceSchema = new Schema<OBPrerequisiteAcceptanceSchemaType>({
  preRequisiteId: { type: String, required: true },
  employeePsId: { type: String, required: true },
  title: { type: String },
  response: { type: String, required: true },
  deviceInfo: { type: String, required: true },
  ipAddress: { type: String, required: true },
  os: { type: String, required: true },
  responseDate: { type: Date, required: true, default: Date.now },
  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, required: true, default: Date.now },
});

oneBayshorePrerequisiteAcceptanceSchema.index(
  { preRequisiteId: 1, employeePsId: 1, response: 1 },
  { unique: true, background: true, name: 'preRequisiteId_employeePsId_response_uniq_idx' },
);

export const OBPrerequisiteAcceptanceModel: Model<OBPrerequisiteAcceptanceSchemaType> = model(
  MongoCollection.OneBayshorePrerequisiteAcceptanceCollection,
  oneBayshorePrerequisiteAcceptanceSchema,
);
