import {
  AddressType,
  LanguageProficiencyType,
  SkillAndCertificationType,
  EmployeePersonalPreferenceType,
  ImmunizationType,
  EmployeeConsentType,
  JSONLikeType,
} from '..';
import { NotificationPlacementEnum, PriorityEnum, ProvincialCodesEnum, IdentityVariantEnum } from '../../enums';

type UserInfoPayloadType = {
  employeePsId: string;
  primaryUserId: string;
  legacyCmsId?: string | null;
  legacyDynamoId?: string | null;
  firstName: string;
  lastName: string;
  workEmail: string;
  alternateEmail?: string | null;
  phoneNumber?: string | null;
  quickBloxId?: string;
  quickBloxPassword?: string;
  jobId: string;
  jobCode: string;
  jobLevel: number;
  jobTitle: string;
  overriddenJobId?: string;
  overriddenJobLevel?: number;
  profileImage?: string;
  profileVideo?: string;
  managerId?: string;
  approvedStatus: boolean;
  branches: {
    legacyCmsId?: string | null;
    branchId: string;
    branchName: string;
    departmentNames?: string[];
    divisionIds: string[];
    provincialCode: ProvincialCodesEnum;
    branchPhone?: string;
    branchEmail?: string;
    availability?: {
      [dayName: string]: {
        isDayOff: boolean;
        startTime?: string;
        endTime?: string;
      };
    };
  }[];
  overriddenBranches: {
    legacyCmsId?: string | null;
    branchId: string;
    branchName: string;
    departmentNames?: string[];
    divisionIds: string[];
    provincialCode: ProvincialCodesEnum;
    branchPhone?: string;
    branchEmail?: string;
    availability?: {
      [dayName: string]: {
        isDayOff: boolean;
        startTime?: string;
        endTime?: string;
      };
    };
  }[];
  divisions: {
    legacyCmsId?: string | null;
    divisionId: string;
    divisionName: string;
  }[];
  defaultChatGroupId?: string;
  deviceTokens: string[];
  postLikedIds: string[];
  pendingPrerequisites: {
    step: string;
    prerequisiteId: string;
    title: string;
    details: string | null;
    skippable: boolean;
    declinable: boolean;
    confirmationRequired: boolean;
    assertionText?: string;
    declineWarning?: string;
    shouldConfirmRead?: boolean;
    nextLabel?: string;
    nextPrereqId?: string;
  }[];
  preferences: {
    preferenceId: string;
    preferenceName: string;
    preferenceValue: string;
  }[];
  provinces: {
    provinceName: string;
    provincialCode: string;
  }[];
  alerts: {
    alertId: string;
    alertTitle: string;
    alertMessage: string;
    tag?: string;
    priority: PriorityEnum;
    notifyUser?: boolean; // Deprecated but exists for now
    validity?: string; // Deprecated but exists for now
    deeplinkTo?: string;
    deeplinkParams?: JSONLikeType;
    placements: NotificationPlacementEnum[];
    isClearable: boolean;
    isNew: boolean;
    createdAt: Date;
  }[];
  activities: {
    activityId: string;
    activityTitle: string;
    activity: string;
  }[];
  systems: {
    systemName: string;
    empSystemId: string;
    tenantId: string;
  }[];
  createdAt: Date;
  workSchedule?: {
    workType: string;
    workHours: number;
    workFrequency: string;
  };
  firstLoggedAt?: string;
  lastLoggedAt?: string;
};

type EmployeeServicePayloadType = {
  firstName: string;
  lastName: string;
  preferredName?: string;
  phoneNumber?: string;
  alternateEmail?: string;
  photo?: { link: string | null; fileName: string | null };
  managerEmailInSystem?: string;
  managerName?: string;
  workStatusInSystem: string;
  employeeSystems: {
    employeeSystemId: string;
    tenantId: string;
    systemType: string;
  }[];
  hireDate?: string;
  bioInSystem?: string;
  firstLoggedAt?: string;
  lastLoggedAt?: string;
  lastVisitedAt?: string;
  currentAddress?: AddressType;
  gender?: string;
  video?: { link: string | null; fileName: string | null };
  languageProficiencies?: LanguageProficiencyType[];
  specialEducationDesc?: string;
  skillsAndCertifications?: SkillAndCertificationType[];
  immunizations?: ImmunizationType[];
  modeOfTransport?: string;
  userLastEditedAt?: Date;
  canUpdatePersonalPreferences?: boolean;
  personalPreferences?: EmployeePersonalPreferenceType[];
  personalPreferencesRequired?: boolean;
  consents?: EmployeeConsentType[];
  workType?: string;
  minWorkHours?: number;
  workHoursFrequencyUnit?: string;
  topicsForSubscription?: string[];
};

type ProcuraEmployeePayloadType = {
  employeeId: string;
  tenantId: string;
  systemType: string;
  employeePsId: string;
  designation?: string;
  statusInBranch?: {
    branchId: string;
    statusInSystem: string;
    status: string;
  }[];
};

type IdentityCardPayloadType = {
  displayName: string;
  jobTitle: string;
  imageUri?: string;
  location: string;
  locationAddress?: string;
  locationPhone?: string;
  locationDirectorName?: string;
  locationEmail?: string;
  tollFreePhone?: string;
  helpDeskPhone?: string;
  helpDeskEmail?: string;
  variant: IdentityVariantEnum;
};

export { UserInfoPayloadType, EmployeeServicePayloadType, ProcuraEmployeePayloadType, IdentityCardPayloadType };
