import { UserLevelEnum, ProvincialCodesEnum, UserStatusEnum } from '../../enums';

type OBUserPreferencesSchemaType = {
  name: string;
  value: string;
  desc?: string;
};

type OBTempProfileSchemaType = {
  recoveryEmail?: string;
  recoveryPhone?: string;
  tempProfileImgUrl?: string;
  tempProfileStatus?: string;
};

type OBUserJobSchemaType = {
  jobId: string;
  code: string;
  title: string;
  level: number;
};

type OBPreReqSchemaType = {
  preReqId: string;
  title: string;
  response?: string;
  status: string;
  respondedAt?: Date;
};

type OBUserBranchSchemaType = {
  canAccessAll: boolean;
  hasMultiple: boolean;
  selectedBranchIds?: string[];
  isOverridden?: boolean;
  overriddenBranchIds?: string[];
};

type OBUserProvinceSchemaType = {
  canAccessAll: boolean;
  hasMultiple: boolean;
  provincialCodes?: ProvincialCodesEnum[];
};

type OBUserAccessSchemaType = {
  jobId: string;
  level: number;
  name: UserLevelEnum;
  isOverridden?: boolean;
};

type OBUserAlertsSchemaType = {
  alertId: string;
  alertName: string;
  alertTitle: string;
  alertDesc?: string;
  alertAddedAt: Date;
  alertReadAt?: Date;
};

type OBUserTopActivitiesSchemaType = {
  activityName: string;
  activityDesc?: string;
};

type OBUserConsentsSchemaType = {
  consentId: string;
  consentName: string;
  consentDesc?: string;
  consentStatus?: string;
  consentedAt?: Date;
};

type OBUserLegacySystemsSchemaType = {
  legacySystemId: string;
  legacySystemName: string;
  legacySystemState?: string;
  changeDate?: Date;
  legacySystemDesc?: string;
};

type OBVendorSystemsSchemaType = {
  vendorId: string;
  vendorName: string;
  vendorValue: string;
  changeDate?: Date;
  vendorDesc?: string;
};

type OBDeviceTokenType = {
  deviceId: string;
  deviceOS?: string;
  deviceType?: string;
  hasEnabled: boolean;
};

type OBUserBadgeType = {
  badgeImageUrl: string;
  bucketName?: string;
};

type OBUserSchemaType = {
  id?: string;
  employeePsId: string;
  displayName?: string;
  workEmail: string;
  obAccess: OBUserAccessSchemaType;
  activeStatus: UserStatusEnum;
  wasActivated?: boolean;
  branchAccess: OBUserBranchSchemaType;
  provinces: OBUserProvinceSchemaType;
  job: OBUserJobSchemaType;
  deviceTokens: OBDeviceTokenType[];
  legacySystems?: OBUserLegacySystemsSchemaType[];
  vendorSystems?: OBVendorSystemsSchemaType[];
  prerequisites?: OBPreReqSchemaType[];
  tempProfile?: OBTempProfileSchemaType;
  preferences?: OBUserPreferencesSchemaType[];
  topAlerts?: OBUserAlertsSchemaType[];
  topActivities?: OBUserTopActivitiesSchemaType[];
  obConsents?: OBUserConsentsSchemaType[];
  badge?: OBUserBadgeType;
  lastVisit?: OBLastVisitSchemaType;
  lastSyncedAt?: Date;
  activatedAt?: Date;
  firstLoggedAt?: Date;
  lastLoggedAt?: Date;
  lastVisitedAt?: Date;
  hireDate?: Date;
  createdAt: Date;
  updatedAt: Date;
};

type OBLastVisitSchemaType = {
  visitId: string;
  visitStatus: string;
  openAt?: Date;
  closedAt?: Date;
};

export {
  OBUserSchemaType,
  OBUserBranchSchemaType,
  OBUserProvinceSchemaType,
  OBUserAccessSchemaType,
  OBUserPreferencesSchemaType,
  OBTempProfileSchemaType,
  OBUserJobSchemaType,
  OBPreReqSchemaType,
  OBUserConsentsSchemaType,
  OBUserTopActivitiesSchemaType,
  OBUserAlertsSchemaType,
  OBUserLegacySystemsSchemaType,
  OBVendorSystemsSchemaType,
  OBDeviceTokenType,
  OBUserBadgeType,
  OBLastVisitSchemaType,
};
