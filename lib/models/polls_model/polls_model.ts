import { Schema, model } from 'mongoose';
import { MongoCollection as MongoCollectionEnum } from '../../enums';
import { OBPollUserSchemaType, OBPollsSchemaType } from '../../types';

const OBPollUserSchema = new Schema<OBPollUserSchemaType>(
  {
    employeePsId: { type: String, required: true },
    displayName: { type: String, required: true },
    userImageLink: { type: String, required: false },
  },
  { _id: false },
);

const OBPollsSchema = new Schema<OBPollsSchemaType>({
  pollId: { type: String, required: true },
  title: { type: String, required: true },
  pollType: { type: String, required: true },
  audienceLevel: { type: String, required: true },
  branchIds: { type: [String] },
  provincialCodes: { type: [String] },
  divisionIds: { type: [String] },
  accessLevelNames: { type: [String], required: true },
  pollOptions: { type: [String] },
  legacyCmsId: { type: String },
  status: { type: String, required: true },
  priority: { type: String, required: true },
  validFrom: { type: Date, required: true, default: Date.now },
  expiresAt: { type: Date },
  isDeleted: { type: Boolean, required: true, default: false },
  createdBy: { type: OBPollUserSchema, required: true },
  updatedBy: { type: OBPollUserSchema },
  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

OBPollsSchema.index({ pollId: 1 }, { unique: true, background: true, name: 'pollId_uniq_idx' });

OBPollsSchema.index(
  { audienceLevel: 1, accessLevelNames: 1, status: 1, createdAt: -1 },
  { background: true, name: 'pollAudienceLevel_accessLevels_status_createdAt_idx' },
);

export const OBPollModel = model<OBPollsSchemaType>(MongoCollectionEnum.OneBayshorePollsCollection, OBPollsSchema);
