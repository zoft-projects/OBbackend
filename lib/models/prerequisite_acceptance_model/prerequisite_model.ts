import { Schema, model, Model } from 'mongoose';
import { MongoCollection } from '../../enums';
import { OBPrerequisiteSchemaType } from '../../types';

const oneBayshorePrerequisiteSchema = new Schema<OBPrerequisiteSchemaType>({
  preRequisiteId: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  status: { type: String, required: true },
  audienceLevel: { type: String, required: true },
  branchIds: { type: [String] },
  provincialCodes: { type: [String] },
  divisionIds: { type: [String] },
  accessLevelNames: { type: [String], required: true },
  requiresAssertion: { type: Boolean, required: true },
  assertionText: { type: String },
  skippable: { type: Boolean, required: true },
  declinable: { type: Boolean, required: true },
  shouldConfirmRead: { type: Boolean },
  nextLabel: { type: String },
  systemComments: { type: String },
  expiresAt: { type: Date },
  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, required: true, default: Date.now },
});

oneBayshorePrerequisiteSchema.index(
  { preRequisiteId: 1 },
  { unique: true, background: true, name: 'preRequisiteId_uniq_idx' },
);

export const OBPrerequisiteModel: Model<OBPrerequisiteSchemaType> = model(
  MongoCollection.OneBayshorePrerequisiteCollection,
  oneBayshorePrerequisiteSchema,
);
