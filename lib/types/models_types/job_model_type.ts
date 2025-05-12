import { JobCategoryEnum, FeatureEnum } from '../../enums';

type OBJobEquivalentSchemaType = {
  jobEquivalentCode: string;
  systemType: string;
  description?: string;
};

type OBJobSchemaType = {
  id?: string;
  jobId: string;
  jobCode: string;
  jobTitle: string;
  jobLevel: number;
  jobDesc?: string;
  jobStatus: string;
  jobCategories?: JobCategoryEnum[];
  supportedFeatures?: FeatureEnum[];
  jobEquivalentsInSystem: OBJobEquivalentSchemaType[];
  createdAt: Date;
  updatedAt: Date;
};

export { OBJobSchemaType, OBJobEquivalentSchemaType };
