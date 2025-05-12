import { FeatureEnum, JobCategoryEnum } from '../../enums';
import { OBJobSchemaType, OBJobOperationType } from '../../types';

const mapJobOperationToDbRecord = (jobOperationFields: Partial<OBJobOperationType>): Partial<OBJobSchemaType> => {
  const mappedJob: Partial<OBJobSchemaType> = {
    jobId: jobOperationFields.jobId.trim(),
  };

  if (jobOperationFields.jobCode) {
    mappedJob.jobCode = jobOperationFields.jobCode;
  }

  if (jobOperationFields.jobLevel) {
    mappedJob.jobLevel = jobOperationFields.jobLevel;
  }

  if (jobOperationFields.jobTitle) {
    mappedJob.jobTitle = jobOperationFields.jobTitle;
  }

  if (jobOperationFields.jobStatus) {
    mappedJob.jobStatus = jobOperationFields.jobStatus;
  }

  if (Array.isArray(jobOperationFields.supportedFeatures)) {
    const validSSupportedFeatures: FeatureEnum[] = [];
    jobOperationFields.supportedFeatures.forEach((supportedFeature) => {
      if (supportedFeature in FeatureEnum) {
        validSSupportedFeatures.push(supportedFeature);
      }
    });

    mappedJob.supportedFeatures = validSSupportedFeatures;
  }

  // TODO temporarily allow "Chat" feature to user level 1-5 SHOULD REMOVE LATER
  if (!mappedJob.supportedFeatures && jobOperationFields.jobLevel <= 5) {
    mappedJob.supportedFeatures = [FeatureEnum.Chat];
  }

  if (Array.isArray(jobOperationFields.jobCategories) && jobOperationFields.jobCategories.length > 0) {
    const validJobCategories: JobCategoryEnum[] = [];
    jobOperationFields.jobCategories.forEach((category) => {
      if (category in JobCategoryEnum) {
        validJobCategories.push(category as JobCategoryEnum);
      }
    });

    mappedJob.jobCategories = validJobCategories;
  }

  if (jobOperationFields.jobDesc) {
    mappedJob.jobDesc = jobOperationFields.jobDesc;
  }

  return mappedJob;
};

export { mapJobOperationToDbRecord };
