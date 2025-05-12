import { jobService, locationService, tempDataService, userService } from '..';
import { TempDataValueEnum, UserLevelEnum } from '../../enums';
import { logError, logInfo, logWarn } from '../../log/util';
import {
  EnrollmentUpsertOperationType,
  HTTPPostEnrollmentApiInput,
  JSONLikeType,
  OBBranchSchemaType,
  OBJobSchemaType,
  OBProfileUpsertOperationType,
  OBTempDataSchemaType,
  OBUserSchemaType,
  TempDataUpsertOperationType,
} from '../../types';
import {
  mapEmployeePSRecordToOB,
  mapAccessNameToBaseLevel,
  mapApiRequestToOperation,
  mapAccessLevelToName,
  resolveByBatchV2,
  areEqual,
} from '../../utils';

const validateUserEnrollmentProfile = (profileData: EnrollmentUpsertOperationType): void => {
  if (
    !profileData.peopleSoftEmpId ||
    !profileData.workEmail ||
    !profileData.workStatus ||
    !profileData.phone ||
    !profileData.jobCode ||
    !profileData.employeeClass ||
    !profileData.managerPeopleSoftEmpId ||
    !profileData.locationId ||
    !profileData.locationCity ||
    !profileData.locationProvince
  ) {
    throw new Error('Missing mandatory fields');
  }
};

const enrollUserInOB = async (
  transactionId: string,
  userProfileData: EnrollmentUpsertOperationType,
): Promise<string> => {
  logInfo(`[${transactionId}] [SERVICE] enrollUserInOB - Auto enrollment initiated`);

  try {
    const branchDetail = await locationService.getBranchDetailsByLocationId(transactionId, userProfileData.locationId, {
      locationId: userProfileData.locationId,
      locationCity: userProfileData.locationCity,
      locationProvince: userProfileData.locationProvince,
      locationDescription: userProfileData.locationDescription,
    });
    const job = await jobService.getJobById(transactionId, userProfileData.jobCode);

    const mappedProfileData = mapEmployeePSRecordToOB(userProfileData, {
      branchDetail: { branchId: branchDetail.branchId, province: branchDetail.province },
      // If job don't exist in the system assume level as 1
      jobDetail: { jobLevel: job?.jobLevel ?? mapAccessNameToBaseLevel(UserLevelEnum.FIELD_STAFF) },
    });

    await userService.createOrUpdateMultipleObUsers(transactionId, [mappedProfileData]);

    return mappedProfileData.psId;
  } catch (error) {
    logError(`[${transactionId}] [SERVICE] enrollUserInOB - Error while auto enrolling user ${error?.message}`);

    throw error;
  }
};

const backupEnrollmentData = async (
  transactionId: string,
  {
    userPsId,
    enrollmentData,
  }: {
    userPsId: string;
    enrollmentData: JSONLikeType;
  },
): Promise<void> => {
  logInfo(`[${transactionId}] [SERVICE] backupEnrollmentData - Backup initiated`);

  try {
    const enrollmentProfile: TempDataUpsertOperationType = {
      primaryIdentifier: userPsId,
      valueType: TempDataValueEnum.ProfileEnrollment,
      payload: enrollmentData,
    };

    await tempDataService.addTempData(transactionId, enrollmentProfile);
  } catch (backupErr) {
    logError(`[${transactionId}] backupEnrollmentData backup error for ${userPsId}, reason: ${backupErr.message}`);
  }
};

type AuditableFieldsType = {
  jobId: string;
  jobLevel: number;
  jobTitle?: string;
  jobCode: string;
  branchIds: string[];
};

const getTempDataForEmployeePsIds = async (
  transactionId: string,
  employeePsIds: string[],
): Promise<OBTempDataSchemaType[]> => {
  try {
    logInfo(
      `[${transactionId}] [SERVICE] getTempDataForEmployeePsIds - getting temp data for ${employeePsIds.length} employeePsIds`,
    );

    const batchTempData = await tempDataService.getBatchTempData(transactionId, [
      { valueType: TempDataValueEnum.ProfileEnrollment, primaryIdentifiers: employeePsIds },
    ]);

    return batchTempData;
  } catch (getError) {
    logError(`[${transactionId}] syncOBUserProfilesToTempData error, reason: ${getError.message}`);
  }
};

const isUserProfileOutOfSync = (
  expectedUserInfo: AuditableFieldsType,
  dbUserInfo: OBUserSchemaType,
): { isObAccessOutOfSync: boolean; isJobOutOfSync: boolean; isBranchOutOfSync: boolean } => {
  const isObAccessOutOfSync =
    dbUserInfo.obAccess &&
    !dbUserInfo.obAccess.isOverridden &&
    expectedUserInfo.jobId &&
    expectedUserInfo.jobId !== dbUserInfo.obAccess.jobId;

  const isJobOutOfSync =
    (expectedUserInfo.jobId && expectedUserInfo.jobId !== dbUserInfo.job?.jobId) ||
    (expectedUserInfo.jobTitle && expectedUserInfo.jobTitle !== dbUserInfo.job?.title) ||
    (expectedUserInfo.jobLevel && expectedUserInfo.jobLevel !== dbUserInfo.job?.level);

  const obAccessLevel = dbUserInfo.obAccess?.isOverridden ? dbUserInfo.obAccess.level : expectedUserInfo.jobLevel;
  const obAccessName = mapAccessLevelToName(obAccessLevel);

  const expectedCanAccessAll =
    obAccessName === UserLevelEnum.SUPER_ADMIN || (obAccessName === UserLevelEnum.ADMIN && obAccessLevel === 8);
  const expectedHasMultiple =
    obAccessName === UserLevelEnum.ADMIN ||
    obAccessName === UserLevelEnum.CONTROLLED_ADMIN ||
    obAccessName === UserLevelEnum.BRANCH_ADMIN ||
    expectedCanAccessAll;
  const expectedBranches = expectedCanAccessAll ? ['*'] : expectedUserInfo.branchIds;

  const isBranchOutOfSync =
    dbUserInfo.branchAccess &&
    !dbUserInfo.branchAccess.isOverridden &&
    (expectedCanAccessAll !== dbUserInfo.branchAccess.canAccessAll ||
      expectedHasMultiple !== dbUserInfo.branchAccess.hasMultiple ||
      (expectedBranches && !areEqual(expectedBranches.sort(), dbUserInfo.branchAccess.selectedBranchIds.sort())));

  return { isObAccessOutOfSync, isJobOutOfSync, isBranchOutOfSync };
};

const syncOBUserProfilesToTempData = async (transactionId: string, userProfiles: OBUserSchemaType[]): Promise<void> => {
  try {
    logInfo(`[${transactionId}] [SERVICE] syncOBUserProfilesToTempData - syncing method INITIATED`);

    const employeeIdToAuditableFieldsMap = new Map<string, AuditableFieldsType>();
    const jobIdToJobMap = new Map<string, OBJobSchemaType>();
    const locationIdToBranchMap = new Map<string, OBBranchSchemaType>();

    const [branches, jobs] = await Promise.all([
      locationService.getAllBranches(transactionId),
      jobService.getAllJobs(transactionId),
    ]);

    branches.forEach((branch) => {
      if (branch.locationId) {
        locationIdToBranchMap.set(branch.locationId, branch);
      }
    });

    jobs.forEach((job) => {
      jobIdToJobMap.set(job.jobId, job);
    });

    const userTempDatas = await resolveByBatchV2(
      transactionId,
      userProfiles.map((userProfile) => userProfile.employeePsId),
      getTempDataForEmployeePsIds,
      80,
    );

    userTempDatas.forEach((userTempDatum) => {
      if (userTempDatum.payload) {
        const userProfileTempDataPayload: EnrollmentUpsertOperationType = mapApiRequestToOperation(
          userTempDatum.payload as HTTPPostEnrollmentApiInput,
        );

        validateUserEnrollmentProfile(userProfileTempDataPayload);

        const employeePsId = userProfileTempDataPayload.peopleSoftEmpId;
        const expectedJob = jobIdToJobMap.get(userProfileTempDataPayload.jobCode);
        const expectedBranch = locationIdToBranchMap.get(userProfileTempDataPayload.locationId);

        if (!expectedJob || !expectedBranch) {
          logWarn(
            `[${transactionId}] [SERVICE] syncOBUserProfilesToTempData - missing expected job or missing expected branch in maps for employee: ${employeePsId}`,
          );

          return;
        }

        const jobId = userProfileTempDataPayload.jobCode; // IT-sent jobCode maps to OB jobId
        const jobTitle = userProfileTempDataPayload.jobDescription || userProfileTempDataPayload.jobTitle;
        const jobCode = userProfileTempDataPayload.jobTitle; // IT-sent jobTitle maps to OB jobCode
        const jobLevel = expectedJob.jobLevel ?? mapAccessNameToBaseLevel(UserLevelEnum.FIELD_STAFF);

        employeeIdToAuditableFieldsMap.set(employeePsId, {
          jobId,
          jobTitle,
          jobCode,
          jobLevel,
          branchIds: [expectedBranch.branchId],
        });
      } else {
        logWarn(
          `[${transactionId}] [SERVICE] syncOBUserProfilesToTempData - No enrollment payload received for employeePsId: ${userTempDatum.primaryIdentifier}`,
        );
      }
    });

    const dataToUpdate: Partial<OBProfileUpsertOperationType>[] = [];

    const unsyncedUsers: string[] = [];

    userProfiles?.forEach(async (userProfile) => {
      if (!employeeIdToAuditableFieldsMap.has(userProfile.employeePsId)) {
        logWarn(
          `[${transactionId}] [SERVICE] syncOBUserProfilesToTempData - empIdCorrectInfoMap did not have any values stored for employeePsId: ${userProfile.employeePsId}`,
        );
        unsyncedUsers.push(userProfile.employeePsId);

        return;
      }

      const auditableFieldsData = employeeIdToAuditableFieldsMap.get(userProfile.employeePsId);
      const { isObAccessOutOfSync, isJobOutOfSync, isBranchOutOfSync } = isUserProfileOutOfSync(
        auditableFieldsData,
        userProfile,
      );

      const datumToUpdate: Partial<OBProfileUpsertOperationType> = {
        psId: userProfile.employeePsId,
        lastSyncedAt: new Date(),
      };

      if (isJobOutOfSync || isObAccessOutOfSync || isBranchOutOfSync) {
        datumToUpdate.job = {
          jobId: auditableFieldsData.jobId,
          code: auditableFieldsData.jobCode,
          title: auditableFieldsData.jobTitle,
          level: auditableFieldsData.jobLevel,
        };

        if (userProfile.obAccess?.isOverridden) {
          datumToUpdate.overriddenAccessJobId = userProfile.obAccess.jobId;
          datumToUpdate.overriddenAccessJobLevel = userProfile.obAccess.level;
          datumToUpdate.didAdminOverride = true;
        }

        if (isBranchOutOfSync) {
          datumToUpdate.branchIds = auditableFieldsData.branchIds;
        }
        logInfo(
          `[${transactionId}] [SERVICE] syncOBUserProfilesToTempData - user profile ${JSON.stringify({
            obAccess: userProfile.obAccess,
            job: userProfile.job,
            branchAccess: userProfile.branchAccess,
          })} is out of sync with temp data ${JSON.stringify(auditableFieldsData)}`,
        );
      }
      dataToUpdate.push(datumToUpdate);
    });
    if (unsyncedUsers.length > 0) {
      logWarn(
        `[${transactionId}] syncOBUserProfilesToTempData following psIds were not synced: ${JSON.stringify(
          unsyncedUsers,
        )}`,
      );
    }

    await userService.createOrUpdateMultipleObUsers(transactionId, dataToUpdate);
  } catch (backupErr) {
    logError(`[${transactionId}] syncOBUserProfilesToTempData error, reason: ${backupErr.message}`);
  }
};

export { validateUserEnrollmentProfile, enrollUserInOB, backupEnrollmentData, syncOBUserProfilesToTempData };
