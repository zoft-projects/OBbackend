import { Schema, model } from 'mongoose';
import { ActiveStateEnum, MongoCollection as MongoCollectionEnum } from '../../enums';
import { OBMilestoneInteractionSchemaType } from '../../types';

const oneBayshoreMilestoneInteractionSchema = new Schema<OBMilestoneInteractionSchemaType>({
  batchId: { type: String, required: true },
  employeePsId: { type: String, required: true },
  milestoneId: { type: String, required: true },
  servedDate: { type: Date, required: true, default: Date.now },
  referenceId: { type: String },
  status: { type: String, required: true, default: ActiveStateEnum.Active },
  isDeleted: { type: Boolean, required: true, default: false },
  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, required: true, default: Date.now },
});

oneBayshoreMilestoneInteractionSchema.index(
  { batchId: 1, milestoneId: 1, employeePsId: 1, interactedAt: -1 },
  { background: true, unique: true, name: 'milestoneInteraction_batchId_milestoneId_interactedAt_idx' },
);

export const OBMilestoneInteractionModel = model<OBMilestoneInteractionSchemaType>(
  MongoCollectionEnum.OneBayshoreMilestoneInteractionCollection,
  oneBayshoreMilestoneInteractionSchema,
);
