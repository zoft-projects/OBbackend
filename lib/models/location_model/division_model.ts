import { Schema, model, Model } from 'mongoose';
import { MongoCollection } from '../../enums';
import { OBDivisionSchemaType } from '../../types';

const divisionSchema = new Schema<OBDivisionSchemaType>({
  divisionId: { type: String, required: true },
  divisionName: { type: String, required: true },
  description: { type: String },
  legacyId: { type: String },
  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, required: true, default: Date.now },
});

divisionSchema.index({ divisionId: 1 }, { unique: true, background: true, name: 'divisionId_uniq_idx' });

export const OBDivisionModel: Model<OBDivisionSchemaType> = model(
  MongoCollection.OneBayshoreDivisionCollection,
  divisionSchema,
);
