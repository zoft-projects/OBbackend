import { Schema, model } from 'mongoose';

import { MongoCollection } from '../../enums/mongo_collections_enum';

import { OBMilestoneSchemaType, OBMilestoneCreatedByType, OBMilestoneRedirectionSchemaType } from '../../types';

const OBMilestoneRedirectionSchema = new Schema<OBMilestoneRedirectionSchemaType>(
  {
    screenName: { type: String, required: true },
    data: { type: JSON },
  },
  { _id: false },
);

const OBMilestoneCreatedBySchema = new Schema<OBMilestoneCreatedByType>(
  {
    employeePsId: { type: String, required: true },
    displayName: { type: String },
    userImageLink: { type: String },
  },
  { _id: false },
);

const oneBayshoreMilestonesSchema = new Schema<OBMilestoneSchemaType>({
  milestoneId: { type: String, required: true },
  audienceLevel: { type: String, required: true },
  provincialCodes: { type: [String] },
  divisionIds: { type: [String] },
  status: { type: String },
  userPsIds: { type: [String] },
  branchIds: { type: [String] },
  batchId: { type: String, required: true },
  approach: { type: String, required: true },
  milestoneTitle: { type: String, required: true },
  milestoneDescription: { type: String, required: true },
  dayGapForNotification: { type: Number },
  specificDate: { type: Date },
  redirectionProps: OBMilestoneRedirectionSchema,
  featureId: { type: String },
  startDate: { type: Date, required: true, default: Date.now },
  isDeleted: { type: Boolean, default: false },
  expiresAt: { type: Date },
  priority: { type: String, required: true },
  createdByPsId: OBMilestoneCreatedBySchema,
  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, required: true, default: Date.now },
});

oneBayshoreMilestonesSchema.index(
  { milestoneId: 1 },
  { unique: true, background: true, name: 'milestone_milestoneId_uniq_id' },
);

oneBayshoreMilestonesSchema.index(
  { milestoneId: 1, batchId: 1, branchIds: 1, startDate: -1 },
  { background: true, sparse: true, name: 'milestone_milestoneId_batchId_branchIds_startDate_idx' },
);

oneBayshoreMilestonesSchema.index(
  { milestoneId: 1, batchId: 1, userPsIds: 1, startDate: -1 },
  { background: true, sparse: true, name: 'milestone_milestoneId_batchId_userPsIds_startDate_idx' },
);

export const OBMilestoneModel = model<OBMilestoneSchemaType>(
  MongoCollection.OneBayshoreMilestonesCollection,
  oneBayshoreMilestonesSchema,
);
