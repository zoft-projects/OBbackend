import { PreferenceCategoriesEnum, PreferenceNamesEnum } from '../../enums';

enum ConsentTypeEnum {
  MbcShareProfileVideo = 'MBC_SHARE_PROFILEVIDEO',
}

type EmployeeConsentType = {
  id?: string;
  employeePsId: string;
  type: ConsentTypeEnum;
  consentedDate?: Date;
  status: string;
  latest?: boolean;
  additionalComments?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

type EmployeeConsentFilterType = {
  lastCursorId?: string;
  limit: number;
  employeePsId: string;
  type?: string;
};

type Title = {
  title: string;
  lang: string;
};

type CompetencyConsumerType = {
  id: string;
  competencyId: string;
  title: Title[];
  status: string;
  competencyCategoryId: string;
  createdAt: string;
  updatedAt: string;
  isCertificationRequired: boolean;
  isExperienceBased: boolean;
  needVerificationByBranch: boolean;
  jobRoles: string[];
};

type CompetencyCategoryConsumerType = {
  competencyCategoryId: string;
  title: Title[];
  status: string;
  competencyType: string;
  createdAt: string;
  updatedAt: string;
};

type ImmunizationType = {
  type: string;
  photo: string;
  dosesInfo: string;
  dateOfLatestImmunization: string;
};

type SkillAndCertificationType = {
  category: string;
  skill: string;
  photo: string;
  acquiredDate: string;
  expiryDate: string;
};

type LanguageProficiencyType = {
  language: string;
  proficiency: string;
};

type EmployeePersonalPreferenceType = {
  category: PreferenceCategoriesEnum;
  name: PreferenceNamesEnum;
  value: string;
};

type EmployeeConsentCreateType = {
  employeePsId: string;
  type: ConsentTypeEnum;
  status: string;
  additionalComments?: string;
};

export {
  CompetencyConsumerType,
  CompetencyCategoryConsumerType,
  EmployeeConsentType,
  EmployeeConsentFilterType,
  ImmunizationType,
  SkillAndCertificationType,
  LanguageProficiencyType,
  EmployeePersonalPreferenceType,
  EmployeeConsentCreateType,
};
