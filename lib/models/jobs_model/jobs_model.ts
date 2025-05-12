import { Schema, model, Model } from 'mongoose';
import { MongoCollection } from '../../enums';
import { OBJobSchemaType, OBJobEquivalentSchemaType } from '../../types';

const jobEquivalentInSystemSchema = new Schema<OBJobEquivalentSchemaType>({
  jobEquivalentCode: { type: String, required: true },
  systemType: { type: String, required: true },
  description: { type: String },
});

const jobSchema = new Schema<OBJobSchemaType>({
  jobId: { type: String, required: true },
  jobCode: { type: String, required: true },
  jobTitle: { type: String, required: true },
  jobLevel: { type: Number, required: true },
  jobDesc: { type: String },
  jobStatus: { type: String, required: true },
  jobCategories: { type: [String] },
  supportedFeatures: { type: [String], default: [] },
  jobEquivalentsInSystem: { type: [jobEquivalentInSystemSchema], required: true },
  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, required: true, default: Date.now },
});

jobSchema.index({ jobId: 1 }, { unique: true, background: true, name: 'jobId_uniq_idx' });
jobSchema.index({ jobCode: 1 }, { background: true, name: 'jobCode_idx' });

export const OBJobModel: Model<OBJobSchemaType> = model(MongoCollection.OneBayshoreJobCollection, jobSchema);
