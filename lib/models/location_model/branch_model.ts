import { Schema, model, Model } from 'mongoose';
import { MongoCollection } from '../../enums';
import { OBBranchSchemaType } from '../../types';

const branchSchema = new Schema<OBBranchSchemaType>({
  branchName: { type: String, required: true },
  branchId: { type: String, required: true },
  description: { type: String },
  city: { type: String, required: true },
  province: { type: String, required: true },
  postalCode: { type: String },
  address: { type: String },
  locationId: { type: String },
  legacyId: { type: String },
  divisionIds: { type: [String], required: true },
  departmentNames: { type: [String] },
  branchPhone: { type: String },
  branchEmail: { type: String },
  availStartTime: { type: String },
  availEndTime: { type: String },
  tollFreePhone: { type: String },
  branchManagerPsIds: { type: [String] },
  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, required: true, default: Date.now },
});

branchSchema.index({ branchId: 1 }, { unique: true, background: true, name: 'branchId_uniq_idx' });
branchSchema.index({ divisionIds: 1 }, { background: true, name: 'branch_divisionId_idx' });
branchSchema.index(
  { locationId: 1, createdAt: -1 },
  { background: true, sparse: true, name: 'branch_locationId_createdAt_desc_idx' },
);

export const OBBranchModel: Model<OBBranchSchemaType> = model(
  MongoCollection.OneBayshoreBranchCollection,
  branchSchema,
);
