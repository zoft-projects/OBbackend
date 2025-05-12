import {
  AddressType,
  LanguageProficiencyType,
  SkillAndCertificationType,
  EmployeePersonalPreferenceType,
  ImmunizationType,
  EmployeeConsentCreateType,
} from '..';
import { RequestModeEnum, ProvincialCodesEnum } from '../../enums';

type HttpPOSTUpsertOBUser = {
  psId: string;
  displayName?: string;
  workEmail: string;
  overriddenAccessJobId?: string;
  overriddenAccessJobLevel?: number;
  activeStatus: string;
  isActivated?: string;
  branchIds: string[];
  overriddenBranchIds: string[];
  jobId: string;
  jobCode: string;
  jobTitle: string;
  jobLevel: number;
  legacyCmsId?: string;
  legacyDynamoId?: string;
  deviceIds?: string[];
  acsCommunicationUserId?: string;
  quickBloxId?: string;
  quickBloxPassword?: string;
  profileImage?: string;
  recoveryEmail?: string;
  recoveryPhone?: string;
  tempProfileUrl?: string;
  hireDate?: Date;
  tempProfileStatus?: string;
  postReactedIds?: {
    postId: string;
    reactionType: string;
  }[];
  provincialCodes?: ProvincialCodesEnum[];
  preferences?: {
    prefName: string;
    prefValue: string;
  }[];
  activatedAt?: string;
  badge?: {
    badgeImageUrl: string;
    bucketName?: string;
  };
  visitId: string;
  visitStatus: string;
  openAt?: Date;
  closedAt?: Date;
  // DM Efforts
  bioInSystem?: string;
  currentAddress?: AddressType;
  gender?: string;
  videoUrl?: string; // TODO
  languageProficiencies?: LanguageProficiencyType[];
  specialEducationDesc?: string;
  skillsAndCertifications?: SkillAndCertificationType[];
  immunizations?: ImmunizationType[];
  modeOfTransport?: string;
  personalPreferences?: EmployeePersonalPreferenceType[];
  consents?: EmployeeConsentCreateType[];
};

type HttpPutUpdateEmployee = {
  psId: string;
  workEmail: string;
  branchIds: string[];
  jobId: string;
  jobCode: string;
  jobTitle: string;
  jobLevel: number;
  alternateEmail?: string;
  bioInSystem?: string;
  currentAddress?: AddressType;
  phoneNumber?: string;
  gender?: string;
  videoUrl?: string; // TODO
  languageProficiencies?: LanguageProficiencyType[];
  specialEducationDesc?: string;
  skillsAndCertifications?: SkillAndCertificationType[];
  immunizations?: ImmunizationType[];
  modeOfTransport?: string;
  initiatedBy?: RequestModeEnum;
  personalPreferences?: EmployeePersonalPreferenceType[];
};

type PreferencesType = {
  prefName: string;
  prefValue: string;
};

export { HttpPOSTUpsertOBUser, HttpPutUpdateEmployee, PreferencesType };
