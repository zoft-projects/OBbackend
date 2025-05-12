import config from 'config';
import { AudienceEnum, ActiveStateEnum, IdentityVariantEnum, JobCategoryEnum } from '../../enums';
import {
  OBPrerequisiteAcceptanceOperationType,
  OBUserPrerequisiteUpsertOperationType,
  HTTPPostCreatePrerequisiteType,
  OBPrerequisiteUpsertOperationType,
  OBUserSchemaType,
  OBJobSchemaType,
  IdentityCardPayloadType,
  OBBranchDetailedOperationType,
  EmployeeServicePayloadType,
} from '../../types';
import { mapAccessLevelToName, userPsId } from '../../utils';

const supportConfig: { helpDeskPhone?: string; helpDeskEmail?: string } = config.get('Features.support');

const mapPrerequisiteAcceptanceRequestToDBRecord = (
  prerequisiteAcceptance: OBPrerequisiteAcceptanceOperationType,
): OBPrerequisiteAcceptanceOperationType => {
  const { prerequisiteId, employeePsId, title, response, deviceInfo, ipAddress, os } = prerequisiteAcceptance;

  const mappedPrerequisiteAcceptance: Partial<OBPrerequisiteAcceptanceOperationType> = {
    prerequisiteId,
  };

  if (employeePsId) {
    mappedPrerequisiteAcceptance.employeePsId = userPsId(employeePsId);
  }

  if (title) {
    mappedPrerequisiteAcceptance.title = title;
  }

  if (response) {
    mappedPrerequisiteAcceptance.response = response;
  }

  if (deviceInfo) {
    mappedPrerequisiteAcceptance.deviceInfo = deviceInfo;
  }

  if (ipAddress) {
    mappedPrerequisiteAcceptance.ipAddress = ipAddress;
  }

  if (os) {
    mappedPrerequisiteAcceptance.os = os;
  }

  return mappedPrerequisiteAcceptance as OBPrerequisiteAcceptanceOperationType;
};

const mapPrerequisiteRequestToOperation = (
  prerequisite: OBUserPrerequisiteUpsertOperationType,
): OBUserPrerequisiteUpsertOperationType => {
  const { prerequisiteId, employeePsId, type } = prerequisite;

  const mappedPrerequisite: Partial<OBUserPrerequisiteUpsertOperationType> = {
    prerequisiteId,
  };

  if (employeePsId) {
    mappedPrerequisite.employeePsId = userPsId(employeePsId);
  }

  if (type) {
    mappedPrerequisite.type = type;
  }

  return mappedPrerequisite as OBUserPrerequisiteUpsertOperationType;
};

// TODO The mapper needs some refactors
const mapDBUsersToIdentityCardApiPayload = (
  userInfo: OBUserSchemaType,
  employeeInfo: EmployeeServicePayloadType,
  branchInfo: OBBranchDetailedOperationType,
  directorList: OBUserSchemaType[],
  jobDetails: OBJobSchemaType,
): IdentityCardPayloadType => {
  const mappedUserInfo: Partial<IdentityCardPayloadType> = {};

  if (userInfo.displayName) {
    mappedUserInfo.displayName = userInfo.displayName;
  }

  mappedUserInfo.jobTitle = userInfo.job.title;
  // Adding jobTitle from job details if overridden
  if (userInfo.obAccess?.jobId && userInfo.obAccess?.jobId !== userInfo.job.jobId && jobDetails?.jobTitle) {
    mappedUserInfo.jobTitle = jobDetails.jobTitle;
  }

  if (branchInfo.city) {
    mappedUserInfo.location = branchInfo.branchName;
  }

  if (branchInfo.address) {
    mappedUserInfo.locationAddress = `${branchInfo.address},${branchInfo.city}`;
  }

  if (branchInfo.branchPhone) {
    mappedUserInfo.locationPhone = branchInfo.branchPhone;
  }

  if (branchInfo.branchEmail) {
    mappedUserInfo.locationEmail = branchInfo.branchEmail;
  }

  if (branchInfo.tollFreePhone) {
    mappedUserInfo.tollFreePhone = branchInfo.tollFreePhone;
  }

  const [director] = directorList;

  if (director?.displayName) {
    mappedUserInfo.locationDirectorName = director?.displayName;
  }

  mappedUserInfo.imageUri =
    employeeInfo?.photo?.link && !mappedUserInfo.imageUri
      ? employeeInfo.photo.link
      : userInfo?.tempProfile?.tempProfileImgUrl && !mappedUserInfo.imageUri
      ? userInfo.tempProfile.tempProfileImgUrl
      : null;

  if (jobDetails && jobDetails.jobCategories) {
    const [jobCategory] = jobDetails.jobCategories;

    if (jobCategory === JobCategoryEnum.Clinical) {
      mappedUserInfo.variant = IdentityVariantEnum.Medical;
    } else if (jobCategory === JobCategoryEnum.NonClinical) {
      mappedUserInfo.variant = IdentityVariantEnum.Specialty;
    } else {
      mappedUserInfo.variant = IdentityVariantEnum.HomeHealth;
    }
  }

  if (supportConfig.helpDeskEmail) {
    mappedUserInfo.helpDeskEmail = supportConfig.helpDeskEmail;
  }

  if (supportConfig.helpDeskPhone) {
    mappedUserInfo.helpDeskPhone = supportConfig.helpDeskPhone;
  }

  return mappedUserInfo as IdentityCardPayloadType;
};

const mapPrerequisiteApiRequestToOperation = (
  prerequisite: HTTPPostCreatePrerequisiteType,
): OBPrerequisiteUpsertOperationType => {
  const mappedPrerequisite: Partial<OBPrerequisiteUpsertOperationType> = {
    declinable: false,
    requiresAssertion: false,
    skippable: true,
  };

  if (prerequisite.title) {
    mappedPrerequisite.title = prerequisite.title;
  }

  if (prerequisite.description) {
    mappedPrerequisite.description = prerequisite.description;
  }

  if (prerequisite.audienceLevel in AudienceEnum) {
    mappedPrerequisite.audienceLevel = prerequisite.audienceLevel as AudienceEnum;
  }

  if (prerequisite.status in ActiveStateEnum) {
    mappedPrerequisite.status = prerequisite.status as ActiveStateEnum;
  }

  if (Array.isArray(prerequisite.branchIds) && prerequisite.branchIds.length > 0) {
    mappedPrerequisite.branchIds = prerequisite.branchIds;
  }

  if (Array.isArray(prerequisite.divisionIds) && prerequisite.divisionIds.length > 0) {
    mappedPrerequisite.divisionIds = prerequisite.divisionIds;
  }

  if (Array.isArray(prerequisite.jobLevels) && prerequisite.jobLevels.length > 0) {
    mappedPrerequisite.accessLevelNames = [
      ...new Set(prerequisite.jobLevels.map((jobLevel) => mapAccessLevelToName(jobLevel))),
    ];
  }

  if (typeof prerequisite.declinable === 'boolean') {
    mappedPrerequisite.declinable = prerequisite.declinable;
  }

  if (typeof prerequisite.skippable === 'boolean') {
    mappedPrerequisite.skippable = prerequisite.skippable;
  }

  if (typeof prerequisite.requiresAssertion === 'boolean' && prerequisite.assertionText) {
    mappedPrerequisite.requiresAssertion = prerequisite.requiresAssertion;
    mappedPrerequisite.assertionText = prerequisite.assertionText;
  }

  if (prerequisite.expiresAt) {
    mappedPrerequisite.expiresAt = new Date(prerequisite.expiresAt);
  }

  if (prerequisite.overrideId) {
    mappedPrerequisite.overrideId = prerequisite.overrideId;
  }

  if (typeof prerequisite.shouldConfirmRead === 'boolean') {
    mappedPrerequisite.shouldConfirmRead = prerequisite.shouldConfirmRead;
  }

  return mappedPrerequisite as OBPrerequisiteUpsertOperationType;
};

export {
  mapPrerequisiteAcceptanceRequestToDBRecord,
  mapPrerequisiteRequestToOperation,
  mapPrerequisiteApiRequestToOperation,
  mapDBUsersToIdentityCardApiPayload,
};
