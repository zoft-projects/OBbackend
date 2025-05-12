import { FilterQuery, UpdateQuery } from 'mongoose';
import { ActiveStateEnum, AudienceEnum, UserStatusEnum, VendorExternalEnum } from '../../enums';
import { logError, logInfo, logWarn } from '../../log/util';
import { OBPrerequisiteModel, OBPrerequisiteAcceptanceModel, OBUserModel } from '../../models';
import {
  OBPrerequisiteAcceptanceOperationType,
  OBPrerequisiteAcceptanceSchemaType,
  OBUserPrerequisiteUpsertOperationType,
  OBUserSchemaType,
  OBPreReqSchemaType,
  OBPrerequisiteSchemaType,
  OBPrerequisiteUpsertOperationType,
  QuickbloxVendorConfigType,
  MixpanelVendorType,
  OBBranchDetailedOperationType,
  FirebaseVendorWebConfigType,
} from '../../types';
import {
  mapAccessLevelToName,
  getMatchesInArrays,
  createNanoId,
  chunkArray,
  mapAccessNamesFromLevel,
  getEffectiveBranchIds,
} from '../../utils';
import { getQuickbloxConfig, getMixpanelConfig, getFirebaseWebConfig } from '../../vendors';
import * as cacheService from '../cache_service/cache_service';
import * as locationService from '../location_service/location_service';
import * as userService from '../user_service/user_service';
type OnboardingUserType = {
  employeePsId: string;
  branchIds: string[];
  divisionIds: string[];
  jobLevel: number;
};

const createPrerequisite = async (
  transactionId: string,
  prerequisite: OBPrerequisiteUpsertOperationType,
): Promise<string> => {
  logInfo(`[${transactionId}] [SERVICE] createPrerequisite initiated`);

  try {
    if (!prerequisite.title || !prerequisite.audienceLevel || !prerequisite.accessLevelNames) {
      throw new Error('Missing mandatory fields for creating prerequisite');
    }

    const { overrideId, ...prerequisiteFields } = prerequisite;

    const newPrerequisite = new OBPrerequisiteModel({
      preRequisiteId: overrideId ?? `PreReq_${createNanoId(3)}`,
      ...prerequisiteFields,
    });

    await newPrerequisite.save();

    logInfo(`[${transactionId}] [SERVICE] createPrerequisite SUCCESSFUL`);

    await cacheService.remove(transactionId, {
      serviceName: 'prerequisites',
      identifier: `state_${ActiveStateEnum.Active}_false`,
    });

    return newPrerequisite.preRequisiteId;
  } catch (createErr) {
    logError(`[${transactionId}] [SERVICE] createPrerequisite FAILED, reason: ${createErr.message}`);

    throw createErr;
  }
};

const getAllPrerequisites = async (
  transactionId: string,
  filters: { status: ActiveStateEnum; includeExpired: boolean } = {
    status: ActiveStateEnum.Active,
    includeExpired: false,
  },
): Promise<OBPrerequisiteSchemaType[]> => {
  const cachedPrerequisites = (await cacheService.retrieve(transactionId, {
    serviceName: 'prerequisites',
    identifier: `state_${filters.status}_${filters.includeExpired}`,
  })) as OBPrerequisiteSchemaType[] | null;

  if (cachedPrerequisites) {
    return cachedPrerequisites;
  }

  const prerequisites = await OBPrerequisiteModel.find({
    status: ActiveStateEnum.Active,
    $or: [{ expiresAt: null }, { expiresAt: { $gte: new Date() } }],
  });

  await cacheService.persist(transactionId, {
    serviceName: 'prerequisites',
    identifier: `state_${filters.status}_${filters.includeExpired}`,
    data: prerequisites,
    expires: '2h',
  });

  return prerequisites;
};

const getPrerequisiteCriterias = async (
  transactionId: string,
  onboardingUser: OnboardingUserType,
): Promise<OBPrerequisiteSchemaType[]> => {
  const { employeePsId, branchIds, jobLevel, divisionIds } = onboardingUser;

  // Find prerequisites which are of the
  /**
   * Get prerequisites in the following conditions
   * * Active prerequisites
   * * If no expiration or unexpired prerequisites
   */

  const accessLevelName = mapAccessLevelToName(jobLevel);

  const prerequisites = await getAllPrerequisites(transactionId, {
    status: ActiveStateEnum.Active,
    includeExpired: false,
  });

  const requiredPrerequisites: OBPrerequisiteSchemaType[] = [];

  prerequisites.forEach((prerequisite) => {
    if (
      prerequisite.accessLevelNames.length === 0 ||
      (prerequisite.accessLevelNames.length > 0 && !prerequisite.accessLevelNames.includes(accessLevelName))
    ) {
      // Without audience level mentioned we cannot apply prerequisite to the user
      return;
    }

    // If National, every user in the provided job level is required to fulfill the prerequisite
    if (prerequisite.audienceLevel === AudienceEnum.National) {
      requiredPrerequisites.push(prerequisite);

      return;
    }

    // If National, every user in the provided job level and specific branches are required to fulfill the prerequisite
    if (prerequisite.audienceLevel === AudienceEnum.Branch) {
      const { matched } = getMatchesInArrays(branchIds, prerequisite.branchIds);

      if (matched.length > 0) {
        requiredPrerequisites.push(prerequisite);

        return;
      }
    }

    // If National, every user in the provided job level and specific divisions are required to fulfill the prerequisite
    if (prerequisite.audienceLevel === AudienceEnum.Division) {
      const { matched } = getMatchesInArrays(divisionIds, prerequisite.divisionIds);

      if (matched.length > 0) {
        requiredPrerequisites.push(prerequisite);

        return;
      }
    }
  });

  logInfo(
    `[${transactionId}] getPrerequisiteCriterias - Identify any prerequisites for this psId: ${employeePsId}, found: ${requiredPrerequisites.length} prerequisites`,
  );

  if (requiredPrerequisites.length > 0) {
    logInfo(
      `[${transactionId}] getPrerequisiteCriterias - Identified ${
        requiredPrerequisites.length
      } prerequisites for this psId: ${employeePsId}, details: ${JSON.stringify(
        requiredPrerequisites.map(({ preRequisiteId }) => preRequisiteId),
      )}`,
    );
  }

  return requiredPrerequisites;
};

const updatePrerequisitesForUser = async (
  transactionId: string,
  prerequisite: OBUserPrerequisiteUpsertOperationType,
): Promise<void> => {
  const { employeePsId, prerequisiteId, type } = prerequisite;

  try {
    // find the employees using array of employeePsIds
    const [employee]: OBUserSchemaType[] = await userService.getObUsersByPsIds(transactionId, [employeePsId]);

    if (!employee) {
      logInfo(
        `[${transactionId}] [SERVICE] updatePrerequisitesForUser - employee is not found, then skip the employee update, employeePsId ${employeePsId}`,
      );

      return;
    }

    const pendingEmpPrerequisite = employee.prerequisites.find(({ preReqId }) => preReqId === prerequisiteId);

    if (!pendingEmpPrerequisite) {
      logInfo(
        `[${transactionId}] [SERVICE] updatePrerequisitesForUser - this prerequisite already accepted, then skip the employee update, employeePsId ${employeePsId}, type: ${type}, prerequisiteId: ${prerequisiteId}`,
      );

      return;
    }

    const updatedPrerequisites = employee.prerequisites.filter(({ preReqId }) => preReqId !== prerequisiteId);
    // update employee collection with this new prerequisites
    await userService.updateUserByPsId(transactionId, { psId: employeePsId, prerequisites: updatedPrerequisites });

    logInfo(
      `[${transactionId}] [SERVICE] updatePrerequisitesForUser - update user record SUCCESSFUL for employeePsId: ${employeePsId}, type: ${type}`,
    );
  } catch (createErr) {
    logError(
      `[${transactionId}] [SERVICE] updatePrerequisitesForUser - ERROR updating in employeePsId: ${employeePsId}, type: ${type}, prerequisiteId ${prerequisiteId}, reason: ${createErr.message}`,
    );

    throw createErr;
  }
};

const updateSSPRPrerequisites = async (
  transactionId: string,
  prerequisite: OBUserPrerequisiteUpsertOperationType,
): Promise<void> => {
  const { employeePsId, prerequisiteId, type } = prerequisite;

  try {
    logInfo(
      `[${transactionId}] [SERVICE] updateSSPRPrerequisites - updating Sspr prerequisite in employeePsId: ${employeePsId}, type: ${type}, prerequisiteId ${prerequisiteId}`,
    );

    if (!prerequisiteId || !employeePsId || !type) {
      throw new Error(`Missing mandatory fields for ${prerequisiteId}`);
    }

    await updatePrerequisitesForUser(transactionId, prerequisite);
  } catch (createErr) {
    logError(
      `[${transactionId}] [SERVICE] updateSSPRPrerequisites - ERROR updating in employeePsId: ${employeePsId}, type: ${type}, prerequisiteId ${prerequisiteId}, reason: ${createErr.message}`,
    );

    throw createErr;
  }
};

const createPrerequisiteAcceptance = async (
  transactionId: string,
  prerequisiteAcceptance: OBPrerequisiteAcceptanceOperationType,
): Promise<OBPrerequisiteAcceptanceSchemaType> => {
  const { employeePsId, prerequisiteId } = prerequisiteAcceptance;

  try {
    if (
      !prerequisiteId ||
      !employeePsId ||
      !prerequisiteAcceptance.response ||
      !prerequisiteAcceptance.deviceInfo ||
      !prerequisiteAcceptance.ipAddress ||
      !prerequisiteAcceptance.os
    ) {
      throw new Error(`Missing mandatory fields for ${prerequisiteId}`);
    }

    logInfo(
      `[${transactionId}] [SERVICE] createPrerequisiteAcceptance - create record initiated for employeePsId: ${employeePsId}, prerequisiteId: ${prerequisiteId}`,
    );

    const previousAcceptanceRecord = await OBPrerequisiteAcceptanceModel.findOne({
      preRequisiteId: prerequisiteId,
      employeePsId,
      response: prerequisiteAcceptance.response,
    });

    if (previousAcceptanceRecord) {
      const previousAcceptance = previousAcceptanceRecord.toJSON();

      logInfo(
        `[${transactionId}] [SERVICE] createPrerequisiteAcceptance - Skipping since user ${employeePsId} previously answered: ${prerequisiteAcceptance.response}`,
      );

      return previousAcceptance;
    }
    const newPrerequisiteAcceptance = new OBPrerequisiteAcceptanceModel({
      preRequisiteId: prerequisiteId,
      employeePsId,
      response: prerequisiteAcceptance.response,
      deviceInfo: prerequisiteAcceptance.deviceInfo,
      ipAddress: prerequisiteAcceptance.ipAddress,
      os: prerequisiteAcceptance.os,
      title: prerequisiteAcceptance.title ?? null,
    });

    // Storing the record
    const createdPrerequisiteAcceptance = await newPrerequisiteAcceptance.save();
    const createdPrerequisiteAcceptanceData: OBPrerequisiteAcceptanceSchemaType =
      createdPrerequisiteAcceptance.toJSON();
    logInfo(
      `[${transactionId}] [SERVICE] createPrerequisiteAcceptance - create record SUCCESSFUL for employeePsId: ${employeePsId}, prerequisiteId: ${prerequisiteId}`,
    );

    await updatePrerequisitesForUser(transactionId, prerequisiteAcceptance);

    return createdPrerequisiteAcceptanceData;
  } catch (createErr) {
    logError(
      `[${transactionId}] [SERVICE] createPrerequisiteAcceptance - ERROR creating in employeePsId: ${employeePsId}, prerequisiteId ${prerequisiteId}, reason: ${createErr.message}`,
    );

    throw createErr;
  }
};

const removePrerequisiteById = async (transactionId: string, prerequisiteId: string): Promise<string> => {
  logInfo(
    `[${transactionId}] [SERVICE] removePrerequisiteById - Removing prerequisite for prerequisiteId: ${prerequisiteId}`,
  );

  try {
    const [removedResult] = await Promise.all([
      OBPrerequisiteModel.findOneAndDelete({
        preRequisiteId: prerequisiteId,
      }),
      cacheService.remove(transactionId, {
        serviceName: 'prerequisites',
        identifier: `state_${ActiveStateEnum.Active}_false`,
      }),
    ]);

    if (removedResult?.preRequisiteId) {
      logInfo(
        `[${transactionId}] [SERVICE] removePrerequisiteById - Removed prerequisite id ${removedResult.preRequisiteId} SUCCESSFULLY`,
      );

      return removedResult.preRequisiteId;
    }

    logWarn(`[${transactionId}] [SERVICE] removePrerequisiteById - no matching ${prerequisiteId} found and skipping`);

    return prerequisiteId;
  } catch (removeErr) {
    logError(
      `[${transactionId}] [SERVICE] removePrerequisiteById - Removal for prerequisite ${prerequisiteId} FAILED, reason: ${removeErr.message}`,
    );

    throw removeErr;
  }
};

const getUsersForPrereqsByCustomFilter = async (
  transactionId: string,
  customFilters: FilterQuery<OBUserSchemaType>,
  maxQueryCount = 400,
) => {
  let maxLoopCounter = 0;
  let allUsersByQuery: OBUserSchemaType[] = [];
  while (maxLoopCounter < 100) {
    maxLoopCounter += 1;
    try {
      const bucketedUsers = await userService.getObUsersByFilter(transactionId, customFilters, {
        skip: (maxLoopCounter - 1) * maxQueryCount,
        limit: maxQueryCount,
      });

      allUsersByQuery = [...allUsersByQuery, ...bucketedUsers];

      if (bucketedUsers.length < maxQueryCount) {
        break;
      }
    } catch (err) {
      break;
    }
  }

  return allUsersByQuery;
};

const updateSeveralUsersByPsIds = async (
  transactionId: string,
  severalEmployeePsIds: string[] = [],
  updateProps: UpdateQuery<OBUserSchemaType>,
) => {
  let totalModified = 0;

  if (severalEmployeePsIds.length === 0) {
    throw new Error('No pending employees to be updated for prepreqs');
  }

  const employeePsIdBuckets = chunkArray(severalEmployeePsIds, 100);

  logInfo(`[${transactionId}] [SERVICE] updateSeveralUsersByPsIds - update for ${severalEmployeePsIds.length} users`);
  logInfo(
    `[${transactionId}] [SERVICE] updateSeveralUsersByPsIds - update user bucket: ${JSON.stringify(
      employeePsIdBuckets,
    )} users`,
  );

  for (const employeePsIds of employeePsIdBuckets) {
    // TODO Move user related changes to user service
    const { modifiedCount } = await OBUserModel.updateMany(
      {
        employeePsId: {
          $in: employeePsIds,
        },
      },
      updateProps,
    );

    totalModified += modifiedCount;
  }

  logInfo(`[${transactionId}] [SERVICE] updateSeveralUsersByPsIds - update SUCCESSFUL for ${totalModified} users`);

  return totalModified;
};

const alignPrerequisiteForAllUsersByPrereqId = async (
  transactionId: string,
  prerequisiteId: string,
): Promise<{ syncUserCount: number }> => {
  if (!prerequisiteId) {
    throw new Error('Missing mandatory prerequisite id field');
  }

  let totalSyncedUserCount = 0;

  const [prerequisite, prerequisiteAcceptances] = await Promise.all([
    OBPrerequisiteModel.findOne({
      preRequisiteId: prerequisiteId,
    }).then((record) => record?.toJSON()),
    OBPrerequisiteAcceptanceModel.find({
      preRequisiteId: prerequisiteId,
    }).then((records) => records.map((record) => record.toJSON())),
  ]);

  if (!prerequisite) {
    throw new Error(`Unable to find a matching prerequisite ${prerequisiteId} to align`);
  }

  const previouslyAnsweredPsIds = new Set<string>();

  prerequisiteAcceptances.forEach(({ employeePsId }) => {
    previouslyAnsweredPsIds.add(employeePsId);
  });

  let targetedJobLevels: number[] = [];

  prerequisite.accessLevelNames.forEach((accessName) => {
    targetedJobLevels = [...targetedJobLevels, ...mapAccessNamesFromLevel(accessName)];
  });

  if (prerequisite.audienceLevel === AudienceEnum.National) {
    const unansweredUsers = await getUsersForPrereqsByCustomFilter(transactionId, {
      employeePsId: {
        $nin: [...previouslyAnsweredPsIds],
      },
      'job.level': {
        $in: [...targetedJobLevels],
      },
      activeStatus: UserStatusEnum.Active,
      'prerequisites.preReqId': { $ne: prerequisiteId },
    });

    logInfo(
      `[${transactionId}] [SERVICE] alignPrerequisiteForAllUsersByPrereqId total users collected for prereqId: ${prerequisiteId} are ${unansweredUsers.length}`,
    );

    const unmappedUsers = unansweredUsers.filter(
      (user) => !user.prerequisites.some(({ preReqId }) => preReqId === prerequisiteId),
    );

    if (unmappedUsers.length === 0) {
      logInfo(
        `[${transactionId}] [SERVICE] alignPrerequisiteForAllUsersByPrereqId skipped for prereqId: ${prerequisiteId} since no users are pending to be added`,
      );

      return {
        syncUserCount: 0,
      };
    }

    const unmappedUserPsIds = unmappedUsers.map(({ employeePsId }) => employeePsId);

    logInfo(
      `[${transactionId}] [SERVICE] alignPrerequisiteForAllUsersByPrereqId prereqId: ${prerequisiteId} needs to update ${unmappedUserPsIds.length} users`,
    );

    const requiredPrerequisite: OBPreReqSchemaType = {
      preReqId: prerequisite.preRequisiteId,
      status: prerequisite.status,
      title: prerequisite.title,
    };

    const [modifiedCount] = await Promise.all([
      updateSeveralUsersByPsIds(transactionId, unmappedUserPsIds, {
        $push: {
          prerequisites: requiredPrerequisite,
        },
      }),
      cacheService
        .batchRemove(
          transactionId,
          unmappedUserPsIds.map((psId) => ({
            serviceName: 'userService',
            identifier: psId,
          })),
        )
        .catch(), // Silent fail
    ]);

    totalSyncedUserCount = modifiedCount;
  }

  if (prerequisite.audienceLevel === AudienceEnum.Branch) {
    const unansweredUsers = await getUsersForPrereqsByCustomFilter(transactionId, {
      employeePsId: {
        $nin: [...previouslyAnsweredPsIds],
      },
      'job.level': {
        $in: [...targetedJobLevels],
      },
      $or: [
        {
          'branchAccess.selectedBranchIds': { $in: prerequisite.branchIds },
        },
        {
          'branchAccess.selectedBranchIds': '*', // For super admins this is the value set
        },
      ],
      activeStatus: UserStatusEnum.Active,
      'prerequisites.preReqId': { $ne: prerequisiteId },
    });

    const unmappedUsers = unansweredUsers.filter(
      (user) => !user.prerequisites.some(({ preReqId }) => preReqId === prerequisiteId),
    );

    if (unmappedUsers.length === 0) {
      logInfo(
        `[${transactionId}] [SERVICE] alignPrerequisiteForAllUsersByPrereqId skipped for prereqId: ${prerequisiteId} no pending users found`,
      );

      return {
        syncUserCount: 0,
      };
    }

    const unmappedUserPsIds = unmappedUsers.map(({ employeePsId }) => employeePsId);

    logInfo(
      `[${transactionId}] [SERVICE] alignPrerequisiteForAllUsersByPrereqId prereqId: ${prerequisiteId} needs to update ${unmappedUserPsIds.length} users`,
    );

    const requiredPrerequisite: OBPreReqSchemaType = {
      preReqId: prerequisite.preRequisiteId,
      status: prerequisite.status,
      title: prerequisite.title,
    };

    const [modifiedCount] = await Promise.all([
      updateSeveralUsersByPsIds(transactionId, unmappedUserPsIds, {
        $push: {
          prerequisites: requiredPrerequisite,
        },
      }),
      cacheService
        .batchRemove(
          transactionId,
          unmappedUserPsIds.map((psId) => ({
            serviceName: 'userService',
            identifier: psId,
          })),
        )
        .catch(), // Silent fail
    ]);

    totalSyncedUserCount = modifiedCount;
  }

  return {
    syncUserCount: totalSyncedUserCount,
  };
};

const alignPrerequisiteByPsIds = async (
  transactionId: string,
  prerequisiteId: string,
  employeePsIds: string[],
): Promise<{ syncUserCount: number }> => {
  if (!prerequisiteId) {
    throw new Error('Missing mandatory prerequisite id field');
  }

  logInfo(
    `[${transactionId}] [SERVICE] alignPrerequisiteByPsIds prereqId: ${prerequisiteId} needs to update ${JSON.stringify(
      employeePsIds,
    )}`,
  );

  const [prerequisite, prerequisiteAcceptances] = await Promise.all([
    OBPrerequisiteModel.findOne({
      preRequisiteId: prerequisiteId,
    }).then((record) => record?.toJSON()),
    OBPrerequisiteAcceptanceModel.find({
      preRequisiteId: prerequisiteId,
    }).then((records) => records.map((record) => record.toJSON())),
  ]);

  if (!prerequisite) {
    throw new Error(`Unable to find a matching prerequisite ${prerequisiteId} to align`);
  }

  const requiredPrerequisite: OBPreReqSchemaType = {
    preReqId: prerequisite.preRequisiteId,
    status: prerequisite.status,
    title: prerequisite.title,
  };

  const previouslyAnsweredPsIds = new Set<string>();

  prerequisiteAcceptances.forEach(({ employeePsId }) => {
    previouslyAnsweredPsIds.add(employeePsId);
  });

  let targetedJobLevels: number[] = [];

  prerequisite.accessLevelNames.forEach((accessName) => {
    targetedJobLevels = [...targetedJobLevels, ...mapAccessNamesFromLevel(accessName)];
  });

  const unansweredEmpPsIds = employeePsIds.filter((empPsId) => !previouslyAnsweredPsIds.has(empPsId));

  let userPrereqFilter: FilterQuery<OBUserSchemaType>;

  if (prerequisite.audienceLevel === AudienceEnum.National) {
    userPrereqFilter = {
      employeePsId: {
        $in: [...unansweredEmpPsIds],
      },
      'job.level': {
        $in: [...targetedJobLevels],
      },
      activeStatus: UserStatusEnum.Active,
      'prerequisites.preReqId': { $ne: prerequisiteId },
    };
  } else if (prerequisite.audienceLevel === AudienceEnum.Branch) {
    userPrereqFilter = {
      employeePsId: {
        $in: [...unansweredEmpPsIds],
      },
      $or: [
        {
          'branchAccess.selectedBranchIds': { $in: prerequisite.branchIds },
        },
        {
          'branchAccess.selectedBranchIds': '*', // For super admins this is the value set
        },
      ],
      activeStatus: UserStatusEnum.Active,
      'prerequisites.preReqId': { $ne: prerequisiteId },
    };
  } else if (prerequisite.audienceLevel === AudienceEnum.Individual) {
    userPrereqFilter = {
      employeePsId: {
        $in: [...unansweredEmpPsIds],
      },
      activeStatus: UserStatusEnum.Active,
      'prerequisites.preReqId': { $ne: prerequisiteId },
    };
  }

  const usersMissingPrereqs = await getUsersForPrereqsByCustomFilter(transactionId, userPrereqFilter);

  const unmappedUserPsIds = usersMissingPrereqs.map(({ employeePsId }) => employeePsId);

  logInfo(
    `[${transactionId}] [SERVICE] alignPrerequisiteByPsIds - users unmapped prereqs ${JSON.stringify(
      unmappedUserPsIds,
    )}`,
  );

  const [modifiedCount] = await Promise.all([
    updateSeveralUsersByPsIds(transactionId, unmappedUserPsIds, {
      $push: {
        prerequisites: requiredPrerequisite,
      },
    }),
    cacheService
      .batchRemove(
        transactionId,
        unmappedUserPsIds.map((psId) => ({
          serviceName: 'userService',
          identifier: psId,
        })),
      )
      .catch(), // Silent fail
  ]);

  logInfo(`[${transactionId}] [SERVICE] alignPrerequisiteByPsIds - total users prereq mapped ${modifiedCount}`);

  return {
    syncUserCount: modifiedCount,
  };
};

const getAuthorizedVendors = async (
  transactionId: string,
): Promise<{
  [vendorName: string]: QuickbloxVendorConfigType | MixpanelVendorType | FirebaseVendorWebConfigType;
}> => {
  logInfo(`[${transactionId}] [SERVICE] getAuthorizedVendors initiated`);

  const [qbConfig, mixpanelConfig, firebaseWebConfig] = await Promise.all([
    getQuickbloxConfig(),
    getMixpanelConfig(),
    getFirebaseWebConfig(),
  ]);

  return {
    [VendorExternalEnum.Quickblox]: qbConfig,
    [VendorExternalEnum.Mixpanel]: mixpanelConfig,
    [VendorExternalEnum.Firebase]: firebaseWebConfig,
  };
};
const getIdentityDetailsForPsId = async (
  transactionId: string,
  psId: string,
): Promise<[OBUserSchemaType, OBBranchDetailedOperationType]> => {
  logInfo(`[${transactionId}] [SERVICE] getIdentityDetailsForPsId - finding user with psId: ${psId}`);

  try {
    const employeeDetails = await userService.getObUsersByPsId(transactionId, psId);

    if (!employeeDetails) {
      throw new Error(`User with employeeId ${psId} not found`);
    }

    let branchLists: OBBranchDetailedOperationType[] = [];

    if (employeeDetails.branchAccess.canAccessAll) {
      branchLists = await locationService.getAllBranchesWithDivisions(transactionId);
    } else {
      const userBranchIds = getEffectiveBranchIds(
        employeeDetails.branchAccess.overriddenBranchIds,
        employeeDetails.branchAccess.selectedBranchIds,
      );
      branchLists = await Promise.all(
        userBranchIds.map((branchId) => locationService.getBranchDetailsById(transactionId, branchId)),
      );
    }

    const [firstAvailableBranch] = branchLists;

    return [employeeDetails, firstAvailableBranch];
  } catch (error) {
    logError(`[${transactionId}] [SERVICE] getIdentityDetailsForPsId - Error: ${error.message}`);
    throw new Error('Unable to fetch user details');
  }
};

const getSkippedAttemptByPrereqAndPsId = async (
  transactionId: string,
  prereqId: string,
  psId: string,
): Promise<{ prereqId: string; attempts: number }> => {
  logInfo(`[${transactionId}] [SERVICE] getSkippedAttemptByPrereqAndPsId - prereqId: ${prereqId}, psId: ${psId}`);

  try {
    const attemptsDetail: {
      prereqId?: string;
      attempts?: number;
    } = await cacheService.retrieve(transactionId, {
      serviceName: 'prereq_attempts',
      identifier: `psId-${psId}_prereqId-${prereqId}`,
    });

    if (!attemptsDetail?.attempts) {
      return { prereqId, attempts: 0 };
    }

    logInfo(
      `[${transactionId}] [SERVICE] getSkippedAttemptByPrereqAndPsId - prereqId: ${prereqId}, psId: ${psId}, total skipped count: ${attemptsDetail.attempts}`,
    );

    return { prereqId, attempts: attemptsDetail.attempts };
  } catch (getErr) {
    logError(`[${transactionId}] [SERVICE] getSkippedAttemptByPrereqAndPsId - Error: ${getErr.message}`);

    return { prereqId, attempts: 0 };
  }
};

const incrementPrereqAttempts = async (transactionId: string, prereqId: string, psId: string): Promise<string> => {
  try {
    logInfo(`[${transactionId}] [SERVICE] incrementPrereqAttempts - prereqId: ${prereqId}, psId: ${psId}`);

    const { attempts: currentAttemptCount } = await getSkippedAttemptByPrereqAndPsId(transactionId, prereqId, psId);

    await cacheService.persist(transactionId, {
      serviceName: 'prereq_attempts',
      identifier: `psId-${psId}_prereqId-${prereqId}`,
      data: {
        prereqId,
        attempts: currentAttemptCount + 1,
      },
      expires: '30d',
    });

    logInfo(
      `[${transactionId}] [SERVICE] incrementPrereqAttempts - prereqId: ${prereqId}, psId: ${psId}, current attempts: ${
        currentAttemptCount + 1
      }`,
    );
  } catch (incErr) {
    logError(`[${transactionId}] [SERVICE] incrementPrereqAttempts FAILED, reason: ${incErr.message}`);
  }

  return prereqId;
};

export {
  getAllPrerequisites,
  getPrerequisiteCriterias,
  createPrerequisite,
  createPrerequisiteAcceptance,
  updateSSPRPrerequisites,
  removePrerequisiteById,
  alignPrerequisiteByPsIds,
  alignPrerequisiteForAllUsersByPrereqId,
  getAuthorizedVendors,
  getIdentityDetailsForPsId,
  getSkippedAttemptByPrereqAndPsId,
  incrementPrereqAttempts,
};
