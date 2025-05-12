import {
  AddressType,
  LanguageProficiencyType,
  SkillAndCertificationType,
  EmployeePersonalPreferenceType,
  ImmunizationType,
  EmployeeConsentCreateType,
} from '..';
import { ProvincialCodesEnum, RequestModeEnum } from '../../enums';

type OBProfileUpsertOperationType = {
  psId: string;
  displayName?: string;
  workEmail: string;
  overriddenAccessJobId?: string;
  overriddenAccessJobLevel?: number;
  didAdminOverride?: boolean;
  activeStatus: string;
  isActivated?: string;
  branchIds: string[];
  overriddenBranchIds?: string[];
  job: {
    jobId: string;
    code: string;
    title: string;
    level: number;
  };
  lastVisit?: {
    visitId?: string;
    visitStatus?: string;
    openAt?: Date;
    closedAt?: Date;
  };
  legacyIds?: {
    cmsId?: string;
    dynamoId?: string;
  };
  deviceTokens?: {
    deviceId: string;
    deviceOS?: string;
    hasEnabled: boolean;
  }[];
  vendors?: {
    acsCommunicationUserId?: string;
    quickBloxId?: string;
    quickBloxPassword?: string;
  };
  prerequisites?: {
    preReqId: string;
    title: string;
    response?: string;
    status: string;
    respondedAt?: Date;
  }[];
  badge?: {
    badgeImageUrl: string;
    bucketName?: string;
  };
  tempProfile?: {
    recoveryEmail?: string;
    recoveryPhone?: string;
    imgUrl?: string;
    tempStatus?: string;
  };
  topAlerts?: {
    alertId: string;
    alertName: string;
    alertTitle: string;
    alertDesc?: string;
    alertAddedAt: Date;
    alertReadAt?: Date;
  }[];
  preferences?: {
    prefName: string;
    prefValue: string;
  }[];
  provincialCodes?: ProvincialCodesEnum[];
  activatedAt?: Date;
  firstLoggedAt?: Date;
  lastLoggedAt?: Date;
  lastVisitedAt?: Date;
  lastSyncedAt?: Date;
  hireDate?: Date;
};

type EmployeeInPsUpsertOperationType = {
  psId: string;
  bioInSystem?: string;
  alternateEmail?: string;
  phoneNumber?: string;
  gender?: string;
  profileImage?: string;
  profileVideo?: string;
  firstLoggedAt?: Date;
  lastLoggedAt?: Date;
  lastVisitedAt?: Date;
  languageProficiencies?: LanguageProficiencyType[];
  specialEducationDesc?: string;
  skillsAndCertifications?: SkillAndCertificationType[];
  immunizations?: ImmunizationType[];
  currentAddress?: AddressType;
  modeOfTransport?: string;
  initiatedBy?: RequestModeEnum;
  personalPreferences?: EmployeePersonalPreferenceType[];
  consents?: EmployeeConsentCreateType[];
};

type EmployeeServiceUpsertOperationType = {
  employeePsId: string;
  firstName?: string;
  lastName?: string;
  email: string;
  alternateEmail?: string;
  workStatus: string;
  phoneNumber: string;
  dob?: string;
  hireDate: string;
  jobCodeInSystem: string;
  jobTitleInSystem?: string;
  deptId?: string;
  deptName?: string;
  employeeClassInSystem: string;
  managerEmailInSystem: string;
  locationIdInSystem: string;
  locationCity: string;
  locationProvince: string;
  languages: string[];
  vendorExpDate?: string;
  gender?: string;
  addressLine1?: string;
  addressLine2?: string;
  addressCity?: string;
  addressProvince?: string;
  addressZipcode?: string;
  addressCountry?: string;
  employeeWorkType?: string;
  employeeWorkHours?: number;
  employeeWorkHoursFrequencyUnit?: string;
};

type QuickbloxUserUpsertOperationType = {
  quickBloxId?: string;
  email: string;
  displayName: string;
  customData: {
    psId: string;
    profileImage?: string;
    branchIds: string[];
    jobId: string;
    jobCode: string;
    jobLevel: number;
    accessLevel: number;
    lastAccessedAt?: number;
  };
};

export {
  OBProfileUpsertOperationType,
  EmployeeInPsUpsertOperationType,
  EmployeeServiceUpsertOperationType,
  QuickbloxUserUpsertOperationType,
};
