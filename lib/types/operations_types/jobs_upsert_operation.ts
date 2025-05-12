import { FeatureEnum, JobCategoryEnum } from '../../enums';

type OBJobOperationType = {
  jobId: string;
  jobCode: string;
  jobTitle: string;
  jobLevel: number;
  jobDesc?: string;
  jobStatus: string;
  supportedFeatures?: FeatureEnum[];
  jobCategories?: JobCategoryEnum[];
};

export { OBJobOperationType };
