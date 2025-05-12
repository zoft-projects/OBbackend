import { Schema, model, Model } from 'mongoose';
import { MongoCollection } from '../../enums';
import { OBAnonymizedInfoSchemaType } from '../../types';

const oneBayshoreAnonymizedInfoSchema = new Schema<OBAnonymizedInfoSchemaType>({
  identifier: { type: String, required: true },
  infoKey: { type: String, required: true },
  infoValue: { type: String, required: true },
  infoType: { type: String, required: true },
  description: { type: String },
  payload: { type: JSON },
  requestIp: { type: String },
  requestDeviceInfo: { type: String },
  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, required: true, default: Date.now },
});

oneBayshoreAnonymizedInfoSchema.index(
  { identifier: 1, infoKey: 1, infoType: 1 },
  { unique: true, background: true, name: 'identifier_infoKey_infoType_uniq_idx' },
);

oneBayshoreAnonymizedInfoSchema.index(
  { infoKey: 1, infoType: 1, createdAt: -1 },
  { background: true, name: 'anon_infoKey_infoType_createdAt_desc_idx' },
);

export const OBAnonymizedInfoModel: Model<OBAnonymizedInfoSchemaType> = model(
  MongoCollection.OneBayshoreAnonymizedInfoCollection,
  oneBayshoreAnonymizedInfoSchema,
);
