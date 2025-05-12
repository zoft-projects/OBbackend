import { EmployeePingIdentity } from '@bayshore-healthcare/lib-ping-authentication-middleware';
import config from 'config';
import {
  DayEnum,
  NotificationPlacementEnum,
  PrerequisiteStepEnum,
  PriorityEnum,
  ProvincialCodesEnum,
  UserLevelEnum,
  UserStatusEnum,
  VendorExternalEnum,
  JobCategoryEnum,
} from '../../enums';

import {
  OBUserLegacySystemsSchemaType,
  OBUserSchemaType,
  OBProfileUpsertOperationType,
  HttpPOSTUpsertOBUser,
  OBPreReqSchemaType,
  EmployeeServicePayloadType,
  UserInfoPayloadType,
  OBBranchDetailedOperationType,
  OBPrerequisiteSchemaType,
  HttpPutUpdateEmployee,
  EmployeeInPsUpsertOperationType,
  OBNotificationSchemaType,
  EmployeeConsentType,
  ProcuraEmployeePayloadType,
  OBJobSchemaType,
  OBChatV2GroupSchemaType,
} from '../../types';
import {
  createNanoId,
  userPsId,
  encodeToBase64,
  decodeBase64,
  mapAccessLevelToName,
  namePrimaryId,
  prefixTopicNameForBranch,
  prefixTopicNameForUser,
  differenceInDays,
  prefixTopicNameForGroup,
  prefixTopicNameForGroupAndJobLevel,
} from '../../utils';

const env: string = config.get('Environment.name');
const profileConfig: {
  updateLockedInDays: number;
  forceChangePasswordForPsIds: string[];
} = config.get('Features.profile');
const bucketNameS3: string = config.get('Services.s3.bucketName');

const quickbloxIdentityHelper = {
  toStorage: (userId: string, passcode: string): string => {
    return `${userId}|${encodeToBase64(passcode)}`;
  },
  fromStorage: (combined: string): string[] => {
    const [userId, encodedPasscode] = combined.split('|');

    if (!encodedPasscode || !decodeBase64(encodedPasscode)) {
      return [];
    }

    return [userId, decodeBase64(encodedPasscode)];
  },
};

// TODO get previous record if exists and compare
const mapProfileRequestToDBRecord = (
  profile: Partial<OBProfileUpsertOperationType>,
  prevProfile?: OBUserSchemaType,
): Partial<OBUserSchemaType> => {
  const mappedProfile: Partial<OBUserSchemaType> = {
    employeePsId: userPsId(profile.psId, profile.workEmail ?? ''),
  };

  if (profile.workEmail) {
    mappedProfile.workEmail = profile.workEmail;
  }

  if (profile.displayName) {
    mappedProfile.displayName = profile.displayName;
  }

  if (profile.overriddenAccessJobId) {
    mappedProfile.obAccess = {
      jobId: profile.overriddenAccessJobId,
      level: profile.overriddenAccessJobLevel,
      name: mapAccessLevelToName(profile.overriddenAccessJobLevel),
      isOverridden: !!profile.didAdminOverride,
    };
  } else if (profile.job?.level) {
    mappedProfile.obAccess = {
      jobId: profile.job.jobId,
      level: profile.job.level,
      name: mapAccessLevelToName(profile.job.level),
      isOverridden: !!profile.didAdminOverride,
    };
  }

  if (profile.activeStatus?.toUpperCase()) {
    let activeStatus: UserStatusEnum;
    switch (profile.activeStatus.toUpperCase()) {
      case UserStatusEnum.Active.toUpperCase():
        activeStatus = UserStatusEnum.Active;
        break;
      case UserStatusEnum.Inactive.toUpperCase():
        activeStatus = UserStatusEnum.Inactive;
        break;
      case UserStatusEnum.PaidLeave.toUpperCase():
        activeStatus = UserStatusEnum.PaidLeave;
        break;
      case UserStatusEnum.Leave.toUpperCase():
        activeStatus = UserStatusEnum.Leave;
        break;
      default:
        activeStatus = UserStatusEnum.Unknown;
    }

    mappedProfile.activeStatus = activeStatus;
  }

  mappedProfile.wasActivated = true;
  if (typeof profile.isActivated === 'boolean') {
    mappedProfile.wasActivated = profile.isActivated;
  }

  if (profile.job?.code && profile.job?.level) {
    mappedProfile.job = {
      jobId: profile.job.jobId,
      code: profile.job.code,
      level: profile.job.level,
      title: profile.job.title,
    };
  }

  if (Array.isArray(profile.provincialCodes) && profile.provincialCodes.length > 0) {
    mappedProfile.provinces = {
      canAccessAll: false,
      hasMultiple: false,
      provincialCodes: [],
    };

    if (mapAccessLevelToName(profile.job.level) === UserLevelEnum.SUPER_ADMIN) {
      mappedProfile.provinces.canAccessAll = true;
      mappedProfile.provinces.hasMultiple = true;
    } else if (mapAccessLevelToName(profile.job.level) !== UserLevelEnum.FIELD_STAFF) {
      mappedProfile.provinces.hasMultiple = true;
      mappedProfile.provinces.provincialCodes = profile.provincialCodes;
    } else {
      const [providedProvincialCode] = profile.provincialCodes;

      mappedProfile.provinces.provincialCodes = [providedProvincialCode ?? ProvincialCodesEnum.ALL];
    }
  }

  if (profile.prerequisites) {
    mappedProfile.prerequisites = [];
    for (const prerequisites of profile.prerequisites) {
      mappedProfile.prerequisites.push(mapUserPrerequisiteRequestToDBRecord(prerequisites));
    }
  }

  if (profile.branchIds) {
    // User level 9, 8
    if (
      mappedProfile.obAccess.name === UserLevelEnum.SUPER_ADMIN ||
      // TODO re-assess the below line
      (mappedProfile.obAccess.name === UserLevelEnum.ADMIN && mappedProfile.obAccess.level === 8)
    ) {
      mappedProfile.branchAccess = {
        canAccessAll: true,
        hasMultiple: true,
        selectedBranchIds: ['*'],
      };
      // User level 7(TODO), 6, 5, 4, 3, 2
    } else if (
      mappedProfile.obAccess.name === UserLevelEnum.ADMIN ||
      mappedProfile.obAccess.name === UserLevelEnum.CONTROLLED_ADMIN ||
      mappedProfile.obAccess.name === UserLevelEnum.BRANCH_ADMIN
    ) {
      mappedProfile.branchAccess = {
        canAccessAll: false,
        hasMultiple: true,
        selectedBranchIds: profile.branchIds,
      };
      if (!prevProfile || !prevProfile.branchAccess.isOverridden) {
        mappedProfile.branchAccess.overriddenBranchIds = profile.overriddenBranchIds;
      }
      // User level 1
    } else {
      const [singleBranchId] = profile.branchIds;
      const [singleOverriddenBranchId] = profile.overriddenBranchIds ?? [];
      mappedProfile.branchAccess = {
        canAccessAll: false,
        hasMultiple: false,
        selectedBranchIds: singleBranchId ? [singleBranchId] : [],
      };

      if (!prevProfile || !prevProfile.branchAccess.isOverridden) {
        mappedProfile.branchAccess.overriddenBranchIds = singleOverriddenBranchId ? [singleOverriddenBranchId] : [];
      }
    }
  }

  const legacySystems: OBUserLegacySystemsSchemaType[] = [];
  if (profile.legacyIds?.cmsId) {
    legacySystems.push({
      legacySystemId: profile.legacyIds.cmsId,
      legacySystemName: VendorExternalEnum.LegacyCms,
      changeDate: new Date(),
      legacySystemState: 'E', // TODO create enum to explain E=>Exists, M=Migrated, D=Deleted
    });
  }
  if (profile.legacyIds?.dynamoId) {
    legacySystems.push({
      legacySystemId: profile.legacyIds.dynamoId,
      legacySystemName: VendorExternalEnum.LegacyDynamoDb,
      changeDate: new Date(),
      legacySystemState: 'E', // TODO create enum to explain E=>Exists, M=Migrated, D=Deleted
    });
  }
  if (legacySystems.length > 0) {
    mappedProfile.legacySystems = legacySystems;
  }

  // Initialize vendorSystems with previous data if available
  mappedProfile.vendorSystems = Array.isArray(prevProfile?.vendorSystems) ? [...prevProfile.vendorSystems] : [];

  // Convert existing vendorSystems into a Map for quick lookup
  const vendorMap = new Map(mappedProfile.vendorSystems.map((vendor) => [vendor.vendorId, vendor]));

  // QuickBlox vendor handling
  if (profile.vendors?.quickBloxId && profile.vendors?.quickBloxPassword) {
    const secureVendorValue = quickbloxIdentityHelper.toStorage(
      profile.vendors.quickBloxId,
      profile.vendors.quickBloxPassword,
    );

    vendorMap.set(VendorExternalEnum.Quickblox, {
      vendorId: VendorExternalEnum.Quickblox,
      vendorName: VendorExternalEnum.Quickblox,
      vendorValue: secureVendorValue,
      changeDate: new Date(),
    });
  }

  // Azure Communication Services vendor handling
  if (profile.vendors?.acsCommunicationUserId) {
    vendorMap.set(VendorExternalEnum.Azure, {
      vendorId: VendorExternalEnum.Azure,
      vendorName: 'communicationUserId',
      vendorValue: profile.vendors.acsCommunicationUserId,
      changeDate: new Date(),
    });
  }

  mappedProfile.vendorSystems = Array.from(vendorMap.values());

  if (Array.isArray(profile.preferences) && profile.preferences.length > 0) {
    mappedProfile.preferences = profile.preferences
      .filter(({ prefName, prefValue }) => prefName && prefValue)
      .map(({ prefName, prefValue }) => ({
        name: prefName,
        value: prefValue,
      }));
  }

  if (profile.activatedAt) {
    mappedProfile.activatedAt = profile.activatedAt;
  }

  if (profile.firstLoggedAt) {
    mappedProfile.firstLoggedAt = profile.firstLoggedAt;
  }

  if (profile.lastLoggedAt) {
    mappedProfile.lastLoggedAt = profile.lastLoggedAt;
  }

  if (profile.lastVisitedAt) {
    mappedProfile.lastVisitedAt = profile.lastVisitedAt;
  }

  if (profile.lastSyncedAt) {
    mappedProfile.lastSyncedAt = profile.lastSyncedAt;
  }

  if (profile.deviceTokens) {
    mappedProfile.deviceTokens = [];

    profile.deviceTokens.forEach((deviceToken) => {
      mappedProfile.deviceTokens.push({
        deviceId: deviceToken.deviceId,
        hasEnabled: true,
        deviceOS: deviceToken.deviceOS,
      });
    });
  }
  if (profile.lastVisit?.visitId) {
    mappedProfile.lastVisit = {
      visitId: profile.lastVisit.visitId,
      visitStatus: profile.lastVisit?.visitStatus,
    };
  }

  if (profile.lastVisit?.openAt) {
    mappedProfile.lastVisit.openAt = profile.lastVisit.openAt;
  }

  if (profile.lastVisit?.closedAt) {
    mappedProfile.lastVisit.closedAt = profile.lastVisit.closedAt;
  }

  if (profile.tempProfile?.recoveryEmail) {
    mappedProfile.tempProfile = {
      recoveryEmail: profile.tempProfile.recoveryEmail,
    };
  }
  if (profile.tempProfile?.recoveryPhone) {
    mappedProfile.tempProfile = {
      ...(mappedProfile.tempProfile ?? null),
      recoveryPhone: profile.tempProfile.recoveryPhone,
    };
  }

  if (profile.tempProfile?.imgUrl) {
    mappedProfile.tempProfile = {
      ...(mappedProfile.tempProfile ?? null),
      tempProfileImgUrl: profile.tempProfile.imgUrl,
    };
  }

  if (profile.tempProfile?.tempStatus) {
    mappedProfile.tempProfile = {
      ...(mappedProfile.tempProfile ?? null),
      tempProfileStatus: profile.tempProfile.tempStatus,
    };
  }

  if (profile?.badge?.badgeImageUrl) {
    mappedProfile.badge = {
      badgeImageUrl: profile.badge.badgeImageUrl,
      bucketName: profile.badge?.bucketName,
    };
  }

  if (profile.topAlerts) {
    mappedProfile.topAlerts = profile.topAlerts;
  }
  if (profile.hireDate) {
    mappedProfile.hireDate = profile.hireDate;
  }

  return mappedProfile;
};

const mapProfileApiRequestToServiceRequest = (requestData: HttpPOSTUpsertOBUser): OBProfileUpsertOperationType => {
  const {
    psId,
    workEmail,
    activeStatus,
    branchIds,
    overriddenBranchIds,
    jobId,
    jobCode,
    jobLevel,
    jobTitle,
    deviceIds,
    legacyCmsId,
    legacyDynamoId,
    acsCommunicationUserId,
    quickBloxId,
    quickBloxPassword,
    isActivated,
    activatedAt,
    displayName,
    recoveryEmail,
    recoveryPhone,
    tempProfileUrl,
    tempProfileStatus,
    overriddenAccessJobId,
    overriddenAccessJobLevel,
    preferences,
    provincialCodes,
    bioInSystem,
    specialEducationDesc,
    skillsAndCertifications,
    immunizations,
    gender,
    currentAddress,
    languageProficiencies,
    modeOfTransport,
    personalPreferences,
    profileImage,
    badge,
    visitId,
    visitStatus,
    openAt,
    closedAt,
    consents,
    hireDate,
  } = requestData;

  const mappedPayload: Partial<OBProfileUpsertOperationType & EmployeeInPsUpsertOperationType> = {
    psId,
  };

  if (workEmail) {
    mappedPayload.workEmail = workEmail;
  }

  if (activeStatus) {
    mappedPayload.activeStatus = activeStatus;
  }

  if (branchIds) {
    mappedPayload.branchIds = branchIds;
  }
  if (overriddenBranchIds) {
    mappedPayload.overriddenBranchIds = overriddenBranchIds;
  }

  if (branchIds?.length > 0 && overriddenBranchIds?.length > 0) {
    const originalBranchIdSet = new Set<string>(branchIds);

    mappedPayload.didAdminOverride =
      overriddenBranchIds.every((overriddenBranchId) => originalBranchIdSet.has(overriddenBranchId)) &&
      branchIds.length === overriddenBranchIds.length;
  }

  if (jobId && jobCode && jobTitle && jobLevel) {
    mappedPayload.job = {
      jobId,
      code: jobCode,
      level: jobLevel,
      title: jobTitle,
    };
  }

  if (Array.isArray(deviceIds) && deviceIds.length > 0) {
    mappedPayload.deviceTokens = [];

    deviceIds.forEach((deviceId) => {
      mappedPayload.deviceTokens.push({
        deviceId,
        hasEnabled: true,
      });
    });
  }

  if (legacyCmsId) {
    mappedPayload.legacyIds = mappedPayload.legacyIds ?? {};
    mappedPayload.legacyIds.cmsId = legacyCmsId;
  }
  if (legacyDynamoId) {
    mappedPayload.legacyIds = mappedPayload.legacyIds ?? {};
    mappedPayload.legacyIds.dynamoId = legacyDynamoId;
  }
  if (quickBloxId && quickBloxPassword) {
    mappedPayload.vendors = {
      quickBloxId,
      quickBloxPassword,
    };
  }
  if (acsCommunicationUserId) {
    mappedPayload.vendors = { ...mappedPayload.vendors, acsCommunicationUserId };
  }
  if (displayName) {
    mappedPayload.displayName = displayName;
  }
  if (typeof isActivated === 'boolean') {
    mappedPayload.isActivated = isActivated;
    if (isActivated) {
      mappedPayload.activatedAt = new Date();
      if (activatedAt) {
        mappedPayload.activatedAt = new Date(activatedAt);
      }
    }
  }
  if (recoveryEmail) {
    mappedPayload.tempProfile = {};
    mappedPayload.tempProfile.recoveryEmail = recoveryEmail;
  }
  if (recoveryPhone) {
    mappedPayload.tempProfile = mappedPayload.tempProfile ?? {};
    mappedPayload.tempProfile.recoveryPhone = recoveryPhone;
  }
  if (visitId || visitStatus || openAt || closedAt) {
    mappedPayload.lastVisit = mappedPayload.lastVisit ?? {};
  }
  if (visitId) {
    mappedPayload.lastVisit.visitId = visitId;
  }
  if (visitStatus) {
    mappedPayload.lastVisit.visitStatus = visitStatus;
  }
  if (openAt) {
    mappedPayload.lastVisit.openAt = openAt;
  }
  if (closedAt) {
    mappedPayload.lastVisit.closedAt = closedAt;
  }
  if (tempProfileUrl) {
    mappedPayload.tempProfile = mappedPayload.tempProfile ?? {};
    mappedPayload.tempProfile.imgUrl = tempProfileUrl;
  }
  if (tempProfileStatus) {
    mappedPayload.tempProfile = mappedPayload.tempProfile ?? {};
    mappedPayload.tempProfile.tempStatus = tempProfileStatus;
  }

  if (overriddenAccessJobId) {
    mappedPayload.overriddenAccessJobId = overriddenAccessJobId;
    mappedPayload.overriddenAccessJobLevel = overriddenAccessJobLevel;
  }

  if (hireDate) {
    mappedPayload.hireDate = hireDate;
  }
  if (Array.isArray(preferences) && preferences.length > 0) {
    mappedPayload.preferences = preferences.map(({ prefName, prefValue }) => ({
      prefName,
      prefValue: typeof prefValue !== 'string' ? JSON.stringify(prefValue) : prefValue,
    }));
  }

  if (Array.isArray(provincialCodes) && provincialCodes.length > 0) {
    const validProvincialCodes: ProvincialCodesEnum[] = [];

    provincialCodes.forEach((provincialCode) => {
      if (provincialCode in ProvincialCodesEnum) {
        validProvincialCodes.push(provincialCode as ProvincialCodesEnum);
      }
    });

    mappedPayload.provincialCodes = validProvincialCodes;
  }

  if (bioInSystem) {
    mappedPayload.bioInSystem = bioInSystem;
  }
  if (currentAddress) {
    mappedPayload.currentAddress = currentAddress;
  }
  if (languageProficiencies) {
    mappedPayload.languageProficiencies = languageProficiencies;
  }
  if (skillsAndCertifications) {
    mappedPayload.skillsAndCertifications = skillsAndCertifications;
  }
  if (specialEducationDesc) {
    mappedPayload.specialEducationDesc = specialEducationDesc;
  }
  if (immunizations) {
    mappedPayload.immunizations = immunizations;
  }
  if (gender) {
    mappedPayload.gender = gender;
  }

  if (modeOfTransport) {
    mappedPayload.modeOfTransport = modeOfTransport;
  }
  if (personalPreferences) {
    mappedPayload.personalPreferences = personalPreferences;
  }

  if (profileImage) {
    mappedPayload.profileImage = profileImage;
  }

  if (badge?.badgeImageUrl) {
    mappedPayload.badge = {
      badgeImageUrl: badge.badgeImageUrl,
      bucketName: bucketNameS3,
    };
  }

  if (consents) {
    mappedPayload.consents = consents;
  }

  return mappedPayload as OBProfileUpsertOperationType & EmployeeInPsUpsertOperationType;
};

// TODO Needs to revised and removed if not required
const mapProfileApiRequestToUpdateServiceRequest = (
  requestData: HttpPutUpdateEmployee,
): OBProfileUpsertOperationType => {
  const {
    psId,
    workEmail,
    branchIds,
    jobId,
    jobCode,
    jobLevel,
    jobTitle,
    alternateEmail,
    bioInSystem,
    specialEducationDesc,
    skillsAndCertifications,
    immunizations,
    gender,
    currentAddress,
    phoneNumber,
    languageProficiencies,
    modeOfTransport,
    personalPreferences,
    initiatedBy,
  } = requestData;

  const mappedPayload: Partial<OBProfileUpsertOperationType & EmployeeInPsUpsertOperationType> = {
    psId,
  };

  if (workEmail) {
    mappedPayload.workEmail = workEmail;
  }

  if (branchIds) {
    mappedPayload.branchIds = branchIds;
  }
  if (jobId && jobCode && jobTitle && jobLevel) {
    mappedPayload.job = {
      jobId,
      code: jobCode,
      level: jobLevel,
      title: jobTitle,
    };
  }
  if (phoneNumber) {
    mappedPayload.phoneNumber = phoneNumber;
  }
  if (alternateEmail) {
    mappedPayload.alternateEmail = alternateEmail;
  }
  if (bioInSystem) {
    mappedPayload.bioInSystem = bioInSystem;
  }
  if (currentAddress) {
    mappedPayload.currentAddress = currentAddress;
  }
  if (languageProficiencies) {
    mappedPayload.languageProficiencies = languageProficiencies;
  }
  if (skillsAndCertifications) {
    mappedPayload.skillsAndCertifications = skillsAndCertifications;
  }
  if (specialEducationDesc) {
    mappedPayload.specialEducationDesc = specialEducationDesc;
  }
  if (immunizations) {
    mappedPayload.immunizations = immunizations;
  }
  if (gender) {
    mappedPayload.gender = gender;
  }

  if (modeOfTransport) {
    mappedPayload.modeOfTransport = modeOfTransport;
  }
  if (personalPreferences) {
    mappedPayload.personalPreferences = personalPreferences;
  }
  if (initiatedBy) {
    mappedPayload.initiatedBy = initiatedBy;
  }

  return mappedPayload as OBProfileUpsertOperationType & EmployeeInPsUpsertOperationType;
};

const mapUserPrerequisiteRequestToDBRecord = (prerequisite: OBPreReqSchemaType): OBPreReqSchemaType => {
  const mappedPrerequisite: Partial<OBPreReqSchemaType> = {
    preReqId: prerequisite.preReqId,
  };

  if (prerequisite.title) {
    mappedPrerequisite.title = prerequisite.title;
  }

  if (prerequisite.response) {
    mappedPrerequisite.response = prerequisite.response;
  }

  if (prerequisite.status) {
    mappedPrerequisite.status = prerequisite.status;
  }

  if (prerequisite.respondedAt) {
    mappedPrerequisite.respondedAt = prerequisite.respondedAt;
  }

  return mappedPrerequisite as OBPreReqSchemaType;
};

/**
 * @param obUserInfo
 * @param additionalDetails
 * @returns UserInfoPayloadType
 * @description Mapper to provide data in the api endpoint for users
 */
const mapDBUsersToApiPayload = (
  obUserInfo: OBUserSchemaType,
  additionalDetails: {
    vendors: {
      employeeInfo?: EmployeeServicePayloadType;
      employeeSystemDetails?: ProcuraEmployeePayloadType[];
      employeeInfoFromToken?: EmployeePingIdentity;
      passwordExpiresInDays?: number | null;
      isPasswordExpiringSoon?: boolean | null;
    };
    dependencies: {
      prerequisites?: OBPrerequisiteSchemaType[];
      branches: OBBranchDetailedOperationType[];
      job?: OBJobSchemaType;
      shouldOverrideJobLevel?: boolean | null;
      shouldOverrideBusiness?: boolean | null;
      notifications?: OBNotificationSchemaType[];
      consents?: EmployeeConsentType[];
      interactedNotificationIds: string[];
      prereqAttempts?: { prereqId: string; attempts: number }[];
      chatV2Groups: OBChatV2GroupSchemaType[];
    };
  } = {
    vendors: {},
    dependencies: {
      prerequisites: [],
      branches: [],
      job: null,
      shouldOverrideJobLevel: false,
      shouldOverrideBusiness: false,
      notifications: [],
      interactedNotificationIds: [],
      prereqAttempts: [],
      chatV2Groups: [],
    },
  },
): UserInfoPayloadType => {
  const {
    vendors: {
      employeeInfo,
      employeeInfoFromToken,
      passwordExpiresInDays,
      isPasswordExpiringSoon,
      employeeSystemDetails,
    },
    dependencies: {
      prerequisites,
      branches,
      job,
      shouldOverrideJobLevel,
      shouldOverrideBusiness,
      notifications = [],
      consents,
      interactedNotificationIds,
      prereqAttempts,
      chatV2Groups,
    },
  } = additionalDetails;

  const mappedUserInfo: Partial<UserInfoPayloadType & EmployeeServicePayloadType> = {
    employeePsId: userPsId(obUserInfo.employeePsId, obUserInfo.workEmail),
    primaryUserId: namePrimaryId(userPsId(obUserInfo.employeePsId, obUserInfo.workEmail)),
    workEmail: obUserInfo.workEmail,
    systems: [],
  };

  if (obUserInfo.tempProfile?.tempProfileImgUrl) {
    mappedUserInfo.profileImage = obUserInfo.tempProfile.tempProfileImgUrl;
  }

  if (employeeInfo) {
    mappedUserInfo.firstName = employeeInfo.firstName;
    mappedUserInfo.lastName = employeeInfo.lastName;
    mappedUserInfo.personalPreferencesRequired = true; // to enable personal preferences modal in FE
    mappedUserInfo.canUpdatePersonalPreferences = false; // to enable edit for preferences

    if (employeeInfo.photo?.link && !mappedUserInfo.profileImage) {
      mappedUserInfo.profileImage = employeeInfo.photo?.link;
    }

    if (employeeInfo.managerEmailInSystem) {
      mappedUserInfo.managerId = employeeInfo.managerEmailInSystem;
    }
    if (employeeInfo.alternateEmail) {
      mappedUserInfo.alternateEmail = employeeInfo.alternateEmail;
    }

    if (employeeInfo.phoneNumber) {
      mappedUserInfo.phoneNumber = employeeInfo.phoneNumber;
    }

    if (employeeInfo.bioInSystem) {
      mappedUserInfo.bioInSystem = employeeInfo.bioInSystem;
    }

    if (employeeInfo.gender) {
      mappedUserInfo.gender = employeeInfo.gender;
    }

    if (employeeInfo.languageProficiencies) {
      mappedUserInfo.languageProficiencies = employeeInfo.languageProficiencies;
    }

    if (employeeInfo.specialEducationDesc) {
      mappedUserInfo.specialEducationDesc = employeeInfo.specialEducationDesc;
    }

    if (employeeInfo.skillsAndCertifications) {
      mappedUserInfo.skillsAndCertifications = employeeInfo.skillsAndCertifications;
    }

    if (employeeInfo.immunizations) {
      mappedUserInfo.immunizations = employeeInfo.immunizations;
    }

    if (employeeInfo.currentAddress) {
      mappedUserInfo.currentAddress = employeeInfo.currentAddress;
    }

    if (employeeInfo.modeOfTransport) {
      mappedUserInfo.modeOfTransport = employeeInfo.modeOfTransport;
    }

    if (employeeInfo.personalPreferences) {
      mappedUserInfo.personalPreferences = employeeInfo.personalPreferences;
      mappedUserInfo.personalPreferencesRequired = false;
    }

    if (employeeInfo.managerName) {
      mappedUserInfo.managerName = employeeInfo.managerName;
    }
    if (employeeInfo.userLastEditedAt) {
      mappedUserInfo.userLastEditedAt = employeeInfo.userLastEditedAt;
      mappedUserInfo.canUpdatePersonalPreferences =
        differenceInDays(new Date(), new Date(mappedUserInfo.userLastEditedAt)) > profileConfig.updateLockedInDays;
    }
    if (employeeInfo.hireDate) {
      mappedUserInfo.hireDate = employeeInfo.hireDate;
    }
    if (employeeInfo.video?.link && !mappedUserInfo.profileVideo) {
      mappedUserInfo.profileVideo = employeeInfo.video?.link;
    }
    if (employeeInfo.employeeSystems?.length > 0) {
      mappedUserInfo.systems = employeeInfo.employeeSystems.map((empSystem) => ({
        empSystemId: empSystem.employeeSystemId,
        systemName: empSystem.systemType,
        tenantId: empSystem.tenantId,
      }));
    }
    if (employeeSystemDetails?.length > 0 && mappedUserInfo.systems.length === 0) {
      mappedUserInfo.systems = employeeSystemDetails.map((empSystem) => ({
        empSystemId: empSystem.employeeId,
        systemName: empSystem.systemType,
        tenantId: empSystem.tenantId,
      }));
    }
    if (employeeInfo.workType && employeeInfo.minWorkHours && employeeInfo.workHoursFrequencyUnit) {
      mappedUserInfo.workSchedule = {
        workType: employeeInfo.workType,
        workHours: employeeInfo.minWorkHours,
        workFrequency: employeeInfo.workHoursFrequencyUnit,
      };
    }
  }

  // Use fallback from token if names are not available from the peoplesoft
  if (!mappedUserInfo.firstName && employeeInfoFromToken) {
    mappedUserInfo.firstName = employeeInfoFromToken.givenName;
    mappedUserInfo.lastName = '';
  }

  // Alternate email and phone number take precedence from ActiveDirectory over PeopleSoft
  if (employeeInfoFromToken) {
    if (employeeInfoFromToken.mail) {
      mappedUserInfo.alternateEmail = employeeInfoFromToken.mail;
    }

    if (employeeInfoFromToken.phone) {
      mappedUserInfo.phoneNumber = employeeInfoFromToken.phone;
    }
  }

  if (!mappedUserInfo.firstName && obUserInfo.displayName) {
    const [firstName, lastName = ''] = obUserInfo.displayName.split(' ');
    mappedUserInfo.firstName = firstName;
    mappedUserInfo.lastName = lastName;
  }

  if (obUserInfo.createdAt) {
    mappedUserInfo.createdAt = obUserInfo.createdAt;
  }

  if (obUserInfo.firstLoggedAt) {
    mappedUserInfo.firstLoggedAt = `${obUserInfo.firstLoggedAt}`;
  }

  if (obUserInfo.lastLoggedAt) {
    mappedUserInfo.lastLoggedAt = `${obUserInfo.lastLoggedAt}`;
  }

  // Latest updated information in temp profile would override everything
  if (obUserInfo.tempProfile) {
    if (obUserInfo.tempProfile.recoveryEmail) {
      mappedUserInfo.alternateEmail = obUserInfo.tempProfile.recoveryEmail;
    }
    if (obUserInfo.tempProfile.recoveryPhone) {
      mappedUserInfo.phoneNumber = obUserInfo.tempProfile.recoveryPhone;
    }
  }

  obUserInfo.vendorSystems?.forEach(({ vendorId, vendorValue }) => {
    if (vendorId === VendorExternalEnum.Quickblox && vendorValue) {
      const [quickbloxId, quickbloxPassword] = quickbloxIdentityHelper.fromStorage(vendorValue);

      if (quickbloxId && quickbloxPassword) {
        mappedUserInfo.quickBloxId = quickbloxId;
        mappedUserInfo.quickBloxPassword = quickbloxPassword;
      }
    }
  });

  if (obUserInfo.legacySystems?.length > 0) {
    obUserInfo.legacySystems.forEach((legacySystem) => {
      if (legacySystem.legacySystemName === VendorExternalEnum.LegacyCms) {
        mappedUserInfo.legacyCmsId = legacySystem.legacySystemId;

        return;
      }

      if (legacySystem.legacySystemName === VendorExternalEnum.LegacyDynamoDb) {
        mappedUserInfo.legacyDynamoId = legacySystem.legacySystemId;
      }
    });
  }

  // Device info
  mappedUserInfo.deviceTokens = obUserInfo.deviceTokens.map(({ deviceId }) => deviceId);

  // TODO Post Liked Ids
  mappedUserInfo.postLikedIds = [];

  mappedUserInfo.alerts = [];

  if (isPasswordExpiringSoon) {
    mappedUserInfo.alerts.push({
      alertId: 'PWD_EXP',
      alertTitle: 'Password expiring soon!',
      alertMessage: `Your OneBayshore password will expire in ${passwordExpiresInDays} days. Please update your password to avoid login issues and uninterrupted access to the system.`,
      priority: PriorityEnum.High,
      notifyUser: true,
      validity: env !== 'production' ? '2h' : '24h',
      deeplinkTo: 'ChangePassword',
      placements: [NotificationPlacementEnum.Push],
      isClearable: false,
      isNew: false,
      createdAt: new Date(),
    });
  }

  const notificationsMap = new Map<string, OBNotificationSchemaType>();
  const uniqueAlertIds = new Set<string>();

  if (notifications?.length) {
    notifications.forEach((notification) => notificationsMap.set(notification.notificationId, notification));
  }

  // TODO: Assess if bottom loop is required and remove if not
  obUserInfo.topAlerts.forEach((topAlert) => {
    // Can also filter read/unread alerts
    // Currently removes the alert from the user collection after read

    const notification = notificationsMap.get(topAlert.alertId);

    if (notification) {
      const { notificationPlacements } = notification;

      if (interactedNotificationIds?.length > 0 && interactedNotificationIds.includes(notification.notificationId)) {
        return;
      }

      mappedUserInfo.alerts.push({
        alertId: topAlert.alertId,
        alertTitle: notification.notificationTitle,
        alertMessage: notification.notificationBody,
        priority: notification.priority,
        notifyUser: false,
        validity: null,
        isNew: false,
        isClearable: notification.isClearable ?? true,
        createdAt: notification.createdAt,
        tag: '',
        placements: notificationPlacements ?? [],
        deeplinkTo: notification.redirectionScreen?.screenName,
        deeplinkParams: notification.redirectionScreen?.data,
      });

      uniqueAlertIds.add(topAlert.alertId);
    }
  });

  notifications.forEach((notification) => {
    if (uniqueAlertIds.has(notification.notificationId)) {
      return;
    }

    const { notificationPlacements } = notification;

    if (interactedNotificationIds?.length > 0 && interactedNotificationIds.includes(notification.notificationId)) {
      return;
    }

    mappedUserInfo.alerts.push({
      alertId: notification.notificationId,
      alertTitle: notification.notificationTitle,
      alertMessage: notification.notificationBody,
      priority: notification.priority,
      notifyUser: false,
      validity: null,
      isNew: false,
      isClearable: notification.isClearable ?? true,
      createdAt: notification.createdAt,
      tag: '',
      placements: notificationPlacements ?? [],
      deeplinkTo: notification.redirectionScreen?.screenName,
      deeplinkParams: notification.redirectionScreen?.data,
    });

    uniqueAlertIds.add(notification.notificationId);
  });

  mappedUserInfo.activities = [];
  obUserInfo.topActivities.forEach((topActivity) => {
    // Can also filter read/unread activities
    // Currently removes the activity from the user collection after read
    mappedUserInfo.activities.push({
      activityId: `${createNanoId(5)}`,
      activityTitle: topActivity.activityName,
      activity: topActivity.activityDesc,
    });
  });

  mappedUserInfo.approvedStatus = false;
  if (obUserInfo.activeStatus === UserStatusEnum.Active) {
    mappedUserInfo.approvedStatus = true;
  }

  // Job information
  mappedUserInfo.jobId = obUserInfo.job.jobId;
  mappedUserInfo.jobCode = obUserInfo.job.code;
  mappedUserInfo.jobTitle = obUserInfo.job.title;
  mappedUserInfo.jobLevel = obUserInfo.job.level;

  if (!shouldOverrideJobLevel) {
    mappedUserInfo.overriddenJobId = obUserInfo.obAccess.jobId;
    mappedUserInfo.overriddenJobLevel = obUserInfo.obAccess.level;
  }

  const uniqueDivisions = new Map();

  // Location information - Branch/Divisions/Departments
  mappedUserInfo.branches = [];

  const appendBranchToUser = (branch: OBBranchDetailedOperationType, isPrimary = true) => {
    if (!branch) {
      return;
    }

    const availability: {
      [dayName: string]: {
        isDayOff: boolean;
        startTime?: string;
        endTime?: string;
      };
    } = {
      [DayEnum.Sunday]: {
        isDayOff: true,
      },
      [DayEnum.Saturday]: {
        isDayOff: true,
      },
    };
    for (const day of [DayEnum.Monday, DayEnum.Tuesday, DayEnum.Wednesday, DayEnum.Thursday, DayEnum.Friday]) {
      availability[day] = {
        isDayOff: false,
        startTime: branch.availStartTime ?? '8:30am',
        endTime: branch.availEndTime ?? '4:30pm',
      };
    }

    const branchDetails = {
      branchId: branch.branchId,
      branchName: branch.branchName,
      legacyCmsId: branch.legacyBranchCMSId,
      divisionIds: branch.divisionIds,
      departmentNames: branch.departmentNames,
      provincialCode: branch.province as ProvincialCodesEnum,
      branchPhone: branch.branchPhone,
      branchEmail: branch.branchEmail,
      availability,
    };

    if (isPrimary) {
      mappedUserInfo.branches.push(branchDetails);
    } else {
      if (!mappedUserInfo.overriddenBranches) {
        mappedUserInfo.overriddenBranches = [];
      }
      mappedUserInfo.overriddenBranches.push(branchDetails);
    }

    branch.divisions.forEach((division) => {
      uniqueDivisions.set(division.divisionId, {
        legacyCmsId: division.legacyDivisionCMSId,
        divisionId: division.divisionId,
        divisionName: division.divisionName,
      });
    });
  };

  const hasOverriddenBranchIds =
    Array.isArray(obUserInfo.branchAccess.overriddenBranchIds) &&
    obUserInfo.branchAccess.overriddenBranchIds.length > 0;
  const canOverrideBusiness = shouldOverrideBusiness && hasOverriddenBranchIds;

  const branchMap = new Map<string, OBBranchDetailedOperationType>();
  branches.forEach((branch) => {
    branchMap.set(branch.branchId, branch);
  });

  // TODO Below conditions are too confusing and not readable and should be updated later
  if (obUserInfo.branchAccess.canAccessAll) {
    branches.forEach((branch) => {
      appendBranchToUser(branch, true);
    });
  } else {
    if (canOverrideBusiness) {
      obUserInfo.branchAccess.overriddenBranchIds.forEach((overriddenBranchId) => {
        appendBranchToUser(branchMap.get(overriddenBranchId), true);
      });
    } else {
      obUserInfo.branchAccess.selectedBranchIds.forEach((branchId) => {
        appendBranchToUser(branchMap.get(branchId), true);
      });
      if (!shouldOverrideBusiness && hasOverriddenBranchIds) {
        obUserInfo.branchAccess.overriddenBranchIds.forEach((branchId) => {
          appendBranchToUser(branchMap.get(branchId), false);
        });
      } else if (!shouldOverrideBusiness) {
        mappedUserInfo.overriddenBranches = [...mappedUserInfo.branches];
      }
    }
  }

  mappedUserInfo.divisions = [...uniqueDivisions.values()];

  const prereqHash: {
    [prerequisiteId: string]: OBPrerequisiteSchemaType;
  } = {};
  prerequisites.forEach((prerequisite) => {
    prereqHash[prerequisite.preRequisiteId] = prerequisite;
  });

  // Prerequisites
  mappedUserInfo.pendingPrerequisites = [];
  obUserInfo.prerequisites.forEach((prerequisite) => {
    const selectedPrereq = prereqHash[prerequisite.preReqId];

    if (!selectedPrereq) {
      // The prerequisite becomes inactive or expired, then ignore
      return;
    }

    const currentPrereqStep =
      selectedPrereq.preRequisiteId.toUpperCase() === PrerequisiteStepEnum.Sspr.toUpperCase()
        ? PrerequisiteStepEnum.Sspr.toUpperCase()
        : PrerequisiteStepEnum.Intermittent.toUpperCase();

    const prereqSkippedMap = new Map<string, number>();

    (prereqAttempts ?? []).forEach((attempt) => {
      prereqSkippedMap.set(attempt.prereqId, attempt.attempts);
    });

    // TODO: Move this to the config
    const allowedMaxAttempts = 3;

    let canSkip = selectedPrereq.skippable ?? true;

    if (canSkip && prereqSkippedMap.get(prerequisite.preReqId) > allowedMaxAttempts) {
      canSkip = false;
    }

    mappedUserInfo.pendingPrerequisites.push({
      prerequisiteId: selectedPrereq.preRequisiteId,
      confirmationRequired: selectedPrereq.requiresAssertion ?? false,
      declineWarning: selectedPrereq.assertionText,
      skippable: canSkip,
      title: selectedPrereq.title,
      details: selectedPrereq.description,
      declinable: selectedPrereq.declinable ?? false,
      shouldConfirmRead: selectedPrereq.shouldConfirmRead ?? false,
      nextLabel: selectedPrereq.nextLabel ?? 'Accept',
      step: currentPrereqStep,
    });
  });

  // Preferences
  mappedUserInfo.preferences = Array.isArray(obUserInfo.preferences)
    ? obUserInfo.preferences.map(({ name, value }) => ({
        preferenceId: name,
        preferenceName: name,
        preferenceValue: value,
      }))
    : [];

  mappedUserInfo.defaultChatGroupId = null;

  if (Array.isArray(consents) && consents.length) {
    mappedUserInfo.consents = [];
    consents.forEach((item: EmployeeConsentType) => {
      mappedUserInfo.consents.push({
        id: item.id,
        additionalComments: item.additionalComments,
        type: item.type,
        consentedDate: item.consentedDate,
        status: item.status,
        employeePsId: item.employeePsId,
      });
    });
  }

  mappedUserInfo.topicsForSubscription = [];

  if ([UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.FIELD_STAFF].includes(mapAccessLevelToName(mappedUserInfo.jobLevel))) {
    chatV2Groups.forEach((chatGroup) => {
      mappedUserInfo.topicsForSubscription.push(prefixTopicNameForGroup(chatGroup.groupId));
      mappedUserInfo.topicsForSubscription.push(
        prefixTopicNameForGroupAndJobLevel(chatGroup.groupId, mappedUserInfo.jobLevel),
      );
    });

    // Remove the following after vendor switch
    mappedUserInfo.branches.forEach(({ branchId }) => {
      mappedUserInfo.topicsForSubscription.push(prefixTopicNameForBranch(branchId));
      mappedUserInfo.topicsForSubscription.push(prefixTopicNameForBranch(branchId, `u${mappedUserInfo.jobLevel}`));
      mappedUserInfo.topicsForSubscription.push(prefixTopicNameForBranch(branchId, `j${mappedUserInfo.jobId}`));
      if (job?.jobCategories?.length > 0) {
        if (job.jobCategories.includes(JobCategoryEnum.Clinical)) {
          mappedUserInfo.topicsForSubscription.push(
            prefixTopicNameForBranch(branchId, `u_clinical_${mappedUserInfo.jobLevel}`),
          );
        }
        if (job.jobCategories.includes(JobCategoryEnum.NonClinical)) {
          mappedUserInfo.topicsForSubscription.push(
            prefixTopicNameForBranch(branchId, `u_non_clinical_${mappedUserInfo.jobLevel}`),
          );
        }
        if (job.jobCategories.includes(JobCategoryEnum.Admin)) {
          mappedUserInfo.topicsForSubscription.push(
            prefixTopicNameForBranch(branchId, `u_admin_${mappedUserInfo.jobLevel}`),
          );
        }
      }
    });
    mappedUserInfo.topicsForSubscription.push(prefixTopicNameForUser(mappedUserInfo.employeePsId));
  }

  return mappedUserInfo as UserInfoPayloadType;
};

export {
  mapProfileRequestToDBRecord,
  mapProfileApiRequestToServiceRequest,
  mapUserPrerequisiteRequestToDBRecord,
  mapProfileApiRequestToUpdateServiceRequest,
  mapDBUsersToApiPayload,
  quickbloxIdentityHelper,
};
