import { Schema, model } from 'mongoose';
import { MongoCollection as MongoCollectionEnum } from '../../enums';
import { OBTempDataSchemaType } from '../../types';

const OBTempDataSchema = new Schema<OBTempDataSchemaType>({
  primaryIdentifier: { type: String, required: true },
  secondaryIdentifier: { type: String },
  valueType: { type: String, required: true },
  payload: { type: JSON },
  valueStatus: { type: String },
  version: { type: String, required: true },
  comment: { type: String },
  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, required: true, default: Date.now },
});

OBTempDataSchema.index(
  { valueType: 1, primaryIdentifier: 1, version: -1 },
  { unique: true, background: true, name: 'tempData_valueType_primaryIdentifier_version_uniq_idx' },
);

OBTempDataSchema.index(
  { valueType: 1, updatedAt: -1 },
  { background: true, name: 'tempData_valueType_updatedAtDesc_idx' },
);

OBTempDataSchema.index(
  { valueType: 1, secondaryIdentifier: 1, updatedAt: -1 },
  {
    sparse: true,
    background: true,
    name: 'tempData_valueType_secondaryIdentifier_updatedAtDesc_idx',
  },
);

export const OBTempDataModel = model<OBTempDataSchemaType>(
  MongoCollectionEnum.OneBayshoreTempDataCollection,
  OBTempDataSchema,
);
