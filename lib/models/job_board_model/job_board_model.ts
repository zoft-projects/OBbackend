import { Schema, model, Model } from 'mongoose';
import { MongoCollection } from '../../enums';
import { OBJobBoardSchemaType, OBJobBoardDetailsType } from '../../types';

const OBBoardDetailsSchema = new Schema<OBJobBoardDetailsType>(
  {
    field: { type: String, required: true },
    value: { type: String, required: true },
    order: { type: Number, required: true },
  },
  { _id: false },
);

const OBJobBoardSchema = new Schema<OBJobBoardSchemaType>({
  id: { type: String },
  shiftStartsAt: { type: Date, required: true },
  shiftEndsAt: { type: Date, required: true },
  audienceLevel: { type: String, required: true },
  branchIds: { type: [String] },
  provincialCodes: { type: [String] },
  divisionIds: { type: [String] },
  expiresAt: { type: Date },
  jobShiftId: { type: String, required: true, unique: true },
  priority: { type: String, required: true },
  shiftStatus: { type: String, required: true },
  shiftDetails: { type: [OBBoardDetailsSchema], required: true },
  shiftAssignedToPsId: { type: String },
  createdUserPsId: { type: String },
  isDeleted: { type: Boolean, required: true, default: false },
  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, required: true, default: Date.now },
});

OBJobBoardSchema.index({ jobShiftId: 1 }, { unique: true, background: true, name: 'jobShiftId_uniq_idx' });

OBJobBoardSchema.index(
  { branchIds: 1, audienceLevel: 1, shiftStatus: 1, createdAt: -1 },
  { sparse: true, background: true, name: 'jobShift_branchId_audienceLevel_shiftStatus_createdAtDesc_idx' },
);

OBJobBoardSchema.index(
  { shiftStartDate: -1, branchIds: 1 },
  { sparse: true, background: true, name: 'jobShift_shiftStartsAtDesc_branchId_idx' },
);

export const OBJobBoardModel: Model<OBJobBoardSchemaType> = model(
  MongoCollection.OneBayshoreJobBoardCollection,
  OBJobBoardSchema,
);
