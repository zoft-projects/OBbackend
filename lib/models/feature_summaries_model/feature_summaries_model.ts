import { Schema, model, Model } from 'mongoose';
import { MongoCollection } from '../../enums';
import { OBFeatureSummariesSchemaType } from '../../types';

const OBFeatureSummariesSchema = new Schema<OBFeatureSummariesSchemaType>({
  summaryId: { type: String, required: true },
  metricName: { type: String, required: true },
  captureType: { type: String, required: true },
  captureIdentifier: { type: String, required: true },
  metricStartDate: { type: Date, required: true },
  metricEndDate: { type: Date, required: true },
  metricPayload: { type: JSON, required: true },
  sampleReference: { type: JSON },
  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, required: true, default: Date.now },
});

OBFeatureSummariesSchema.index(
  { summaryId: 1 },
  { unique: true, background: true, name: 'featureSummaries_summaryId_uniq_idx' },
);

OBFeatureSummariesSchema.index(
  {
    metricName: 1,
    captureType: 1,
    captureIdentifier: 1,
    metricStartDate: -1,
    metricEndDate: -1,
  },
  {
    background: true,
    name: 'featureSummaries_metricName_captureType_captureIdentifier_metricStartDate_metricEndDate_Idx',
  },
);

export const OBFeatureSummariesModel: Model<OBFeatureSummariesSchemaType> = model(
  MongoCollection.OneBayshoreFeatureSummariesCollection,
  OBFeatureSummariesSchema,
);
