import { Schema, model } from 'mongoose';

import { MongoCollection } from '../../enums';
import {
  OBTempProfileSchemaType,
  OBUserSchemaType,
  OBUserPreferencesSchemaType,
  OBUserAccessSchemaType,
  OBUserBranchSchemaType,
  OBUserProvinceSchemaType,
  OBUserJobSchemaType,
  OBPreReqSchemaType,
  OBUserTopActivitiesSchemaType,
  OBUserAlertsSchemaType,
  OBUserConsentsSchemaType,
  OBUserLegacySystemsSchemaType,
  OBVendorSystemsSchemaType,
  OBDeviceTokenType,
  OBUserBadgeType,
  OBLastVisitSchemaType,
} from '../../types';

const userPreferenceSchema = new Schema<OBUserPreferencesSchemaType>({
  name: { type: String, required: true },
  value: { type: String, required: true },
});

const tempProfileSchema = new Schema<OBTempProfileSchemaType>(
  {
    recoveryEmail: { type: String },
    recoveryPhone: { type: String },
    tempProfileImgUrl: { type: String },
    tempProfileStatus: { type: String },
  },
  { _id: false },
);

const obAccessSchema = new Schema<OBUserAccessSchemaType>(
  {
    name: { type: String, required: true },
    level: { type: Number, required: true },
    jobId: { type: String, required: true },
    isOverridden: { type: Boolean },
  },
  { _id: false },
);

const userBranchSchema = new Schema<OBUserBranchSchemaType>(
  {
    canAccessAll: { type: Boolean, required: true },
    hasMultiple: { type: Boolean, required: true },
    selectedBranchIds: { type: [String] },
    isOverridden: { type: Boolean },
    overriddenBranchIds: { type: [String] },
  },
  { _id: false },
);

const userProvinceSchema = new Schema<OBUserProvinceSchemaType>(
  {
    canAccessAll: { type: Boolean, required: true },
    hasMultiple: { type: Boolean, required: true },
    provincialCodes: { type: [String] },
  },
  { _id: false },
);

const userLastVisitSchema = new Schema<OBLastVisitSchemaType>(
  {
    visitId: { type: String },
    visitStatus: { type: String },
    openAt: { type: Date },
    closedAt: { type: Date },
  },
  { _id: false },
);

const userJobSchema = new Schema<OBUserJobSchemaType>(
  {
    jobId: { type: String, required: true },
    code: { type: String, required: true },
    title: { type: String, required: true },
    level: { type: Number, required: true },
  },
  { _id: false },
);

const userPreRequisitesSchema = new Schema<OBPreReqSchemaType>(
  {
    preReqId: { type: String, required: true },
    title: { type: String, required: true },
    response: { type: String },
    status: { type: String, required: true },
    respondedAt: { type: Date },
  },
  { _id: false },
);

const userTopAlertsSchema = new Schema<OBUserAlertsSchemaType>(
  {
    alertId: { type: String, required: true },
    alertName: { type: String, required: true },
    alertTitle: { type: String, required: true },
    alertDesc: { type: String },
    alertAddedAt: { type: Date, required: true, default: Date.now },
    alertReadAt: { type: Date },
  },
  { _id: false },
);

const userTopActivitiesSchema = new Schema<OBUserTopActivitiesSchemaType>({
  activityName: { type: String },
  activityDesc: { type: String },
});

const userConsentsSchema = new Schema<OBUserConsentsSchemaType>({
  consentId: { type: String, required: true },
  consentName: { type: String, required: true },
  consentDesc: { type: String },
  consentStatus: { type: String },
  consentedAt: { type: Date },
});

const legacySystemsSchema = new Schema<OBUserLegacySystemsSchemaType>(
  {
    legacySystemId: { type: String, required: true },
    legacySystemName: { type: String, required: true },
    legacySystemState: { type: String },
    changeDate: { type: Date },
    legacySystemDesc: { type: String },
  },
  { _id: false },
);

const vendorSystemsSchema = new Schema<OBVendorSystemsSchemaType>(
  {
    vendorId: { type: String, required: true },
    vendorName: { type: String, required: true },
    vendorValue: { type: String, required: true },
    changeDate: { type: Date, default: Date.now },
    vendorDesc: { type: String },
  },
  { _id: false },
);

const deviceIdsSchema = new Schema<OBDeviceTokenType>(
  {
    deviceId: { type: String, required: true },
    deviceOS: { type: String },
    deviceType: { type: String },
    hasEnabled: { type: Boolean, required: true, default: true },
  },
  { _id: false },
);

const userBadgeSchema = new Schema<OBUserBadgeType>(
  {
    badgeImageUrl: { type: String, required: true },
    bucketName: { type: String, required: false },
  },
  { _id: false },
);

const oneBayshoreUserSchema = new Schema<OBUserSchemaType>({
  employeePsId: { type: String, required: true },
  displayName: { type: String },
  workEmail: { type: String, required: true },
  obAccess: { type: obAccessSchema, required: true },
  activeStatus: { type: String, required: true },
  wasActivated: { type: Boolean, default: true },
  branchAccess: { type: userBranchSchema, required: true },
  provinces: { type: userProvinceSchema, required: true },
  job: { type: userJobSchema, required: true },
  legacySystems: { type: [legacySystemsSchema] },
  vendorSystems: { type: [vendorSystemsSchema] },
  prerequisites: { type: [userPreRequisitesSchema], required: true },
  tempProfile: { type: tempProfileSchema },
  preferences: { type: [userPreferenceSchema] },
  deviceTokens: { type: [deviceIdsSchema] },
  topAlerts: { type: [userTopAlertsSchema] },
  topActivities: { type: [userTopActivitiesSchema] },
  obConsents: { type: [userConsentsSchema] },
  badge: { type: userBadgeSchema },
  lastVisit: { type: userLastVisitSchema },
  lastSyncedAt: { type: Date },
  activatedAt: { type: Date },
  firstLoggedAt: { type: Date },
  lastVisitedAt: { type: Date },
  lastLoggedAt: { type: Date },
  hireDate: { type: Date },
  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, required: true, default: Date.now },
});

oneBayshoreUserSchema.index({ employeePsId: 1 }, { unique: true, background: true, name: 'empPsId_uniq_idx' });

oneBayshoreUserSchema.index({ workEmail: 1 }, { background: true, name: 'email_idx' });

oneBayshoreUserSchema.index(
  { 'branchAccess.selectedBranchIds': 1, activeStatus: 1 },
  { background: true, name: 'branchId_activeStatus_idx' },
);

oneBayshoreUserSchema.index(
  { 'branchAccess.overriddenBranchIds': 1, activeStatus: 1 },
  { sparse: true, background: true, name: 'user_overriddenBranchId_activeStatus_idx' },
);

oneBayshoreUserSchema.index(
  { 'obAccess.level': 1, activeStatus: 1 },
  { background: true, name: 'accessLevelId_activeStatus_idx' },
);

oneBayshoreUserSchema.index(
  { 'legacySystems.legacySystemId': 1 },
  { sparse: true, background: true, name: 'legacySystemId_idx' },
);

oneBayshoreUserSchema.index(
  { 'job.level': 1, activeStatus: 1 },
  {
    background: true,
    name: 'jobLevel_activeStatus_idx',
  },
);

oneBayshoreUserSchema.index(
  { 'job.jobId': 1, activeStatus: 1 },
  {
    background: true,
    name: 'jobId_activeStatus_idx',
  },
);

oneBayshoreUserSchema.index({ createdAt: -1 }, { background: true, name: 'user_createdAt_idx' });

oneBayshoreUserSchema.index({ lastSyncedAt: -1 }, { background: true, sparse: true, name: 'user_lastSyncedAt_idx' });

export const OBUserModel = model<OBUserSchemaType>(MongoCollection.OneBayshoreUserCollection, oneBayshoreUserSchema);
