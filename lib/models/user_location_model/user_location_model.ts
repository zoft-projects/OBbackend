import { Schema, model } from 'mongoose';
import { MongoCollection as MongoCollectionEnum } from '../../enums';
import { OBUserLocationSchemaType } from '../../types';

const UserLocationSchema = new Schema<OBUserLocationSchemaType>({
  locationId: { type: String, required: true },
  groupId: { type: String, required: true },
  employeePsId: { type: String, required: true },
  encodedGeo: { type: String, required: true },
  visitId: { type: String },
  tenantId: { type: String },
  clientId: { type: String },
  cvid: { type: String },
  comment: { type: String },
  captureType: { type: String },
  updatedBy: { type: String },
  deviceTime: { type: Date, required: true },
  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, required: true, default: Date.now },
});

UserLocationSchema.index(
  { locationId: 1 },
  { unique: true, background: true, name: 'user_location_locationId_uniq_idx' },
);
UserLocationSchema.index(
  { employeePsId: 1, groupId: 1, visitId: 1, tenantId: 1, cvid: 1, clientId: 1, captureType: 1, createdAt: -1 },
  {
    sparse: true,
    background: true,
    name: 'user_location_employeePsId_groupId_visitId_tenantId_cvid_clientId_captureType_createdAt_desc_idx',
  },
);
UserLocationSchema.index(
  { employeePsId: 1, deviceTime: -1 },
  { unique: true, background: true, name: 'user_location_employeePsId_deviceTime_desc_uniq_idx' },
);

export const OBUserLocationModel = model<OBUserLocationSchemaType>(
  MongoCollectionEnum.OneBayshoreUserLocationCollection,
  UserLocationSchema,
);
