import { Schema, model } from 'mongoose';
import { MongoCollection as MongoCollectionEnum } from '../../enums';
import { OBPollInteractionSchemaType, OBPollUserSchemaType } from '../../types';

const OBPollUserInteractedSchema = new Schema<OBPollUserSchemaType>(
  {
    employeePsId: { type: String, required: true },
    displayName: { type: String, required: true },
    userImageLink: { type: String },
  },
  { _id: false },
);

const OBPollInteractionSchema = new Schema<OBPollInteractionSchemaType>({
  pollId: { type: String, required: true },
  pollType: { type: String, required: true },
  selectionOptions: { type: [String] },
  feedbackComment: { type: String },
  numOfStars: { type: Number },
  interactedAt: { type: Date, required: true },
  interactedUser: { type: OBPollUserInteractedSchema, required: true },
  isDeleted: { type: Boolean, required: true, default: false },
  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

OBPollInteractionSchema.index(
  { pollId: 1, 'interactedUser.employeePsId': 1 },
  { unique: true, background: true, name: 'pollId_employeePsId_uniq_idx' },
);

OBPollInteractionSchema.index({ pollId: 1, interactedAt: -1 }, { background: true, name: 'pollId_interactedAt_idx' });

export const OBPollInteractionModel = model<OBPollInteractionSchemaType>(
  MongoCollectionEnum.OneBayshorePollInteractionCollection,
  OBPollInteractionSchema,
);
