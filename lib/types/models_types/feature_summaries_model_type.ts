import { JSONLikeType } from '..';

type OBFeatureSummariesSchemaType = {
  summaryId: string;
  metricName: string;
  captureType: string;
  captureIdentifier: string;
  metricStartDate: Date;
  metricEndDate: Date;
  metricPayload: JSONLikeType;
  sampleReference?: JSONLikeType;
  createdAt: Date;
  updatedAt: Date;
};

export { OBFeatureSummariesSchemaType };
