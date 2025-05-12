import { logInfo, logError, logDebug } from '../../log/util';
import { OBDivisionModel, OBBranchModel } from '../../models';
import {
  OBDivisionSchemaType,
  OBBranchSchemaType,
  OBBranchDetailedOperationType,
  OBBranchDivisionUpsertOperationType,
} from '../../types';
import { mapBranchOperationTypeToDbRecord } from '../../utils';
import * as cacheService from '../cache_service/cache_service';

const getAllBranches = async (transactionId: string): Promise<OBBranchSchemaType[]> => {
  try {
    logInfo(`[${transactionId}] [SERVICE] getAllBranches - Fetch all branches initiated`);

    const allBranchesFromCache = (await cacheService.retrieve(transactionId, {
      serviceName: 'location_branches',
      identifier: 'all',
    })) as OBBranchSchemaType[] | null;

    if (allBranchesFromCache?.length > 0) {
      logInfo(`[${transactionId}] [SERVICE] getAllBranches - cached branches returned`);

      return allBranchesFromCache;
    }

    const branchesList = OBBranchModel.find({}).cursor();

    const branches: OBBranchSchemaType[] = [];

    for await (const branch of branchesList) {
      branches.push(branch.toJSON());
    }

    logInfo(`[${transactionId}] [SERVICE] getAllBranches - All branches fetched`);

    await cacheService.persist(transactionId, {
      serviceName: 'location_branches',
      identifier: 'all',
      data: branches,
      expires: '2h',
    });

    await Promise.all(
      branches.map((branch) =>
        cacheService.persist(transactionId, {
          serviceName: 'location_branches',
          identifier: branch.branchId,
          data: branch,
          expires: '2h',
        }),
      ),
    );

    return branches;
  } catch (getErr) {
    logError(`[${transactionId}] [SERVICE] getAllBranches - ERROR fetching branches, reason: ${getErr.message}`);
    throw getErr;
  }
};

const getAllBranchesByIds = async (transactionId: string, branchIds: string[]): Promise<OBBranchSchemaType[]> => {
  try {
    logInfo(`[${transactionId}] [SERVICE] getAllBranchesByIds - Fetch all branches initiated`);

    if (branchIds.length === 0) {
      return [];
    }

    if (branchIds.includes('*')) {
      return getAllBranches(transactionId);
    }

    const cachedResults = await cacheService.batchRetrieve(
      transactionId,
      branchIds.map((branchId) => ({
        serviceName: 'location_branches',
        identifier: branchId,
      })),
    );

    let isCacheMissing = false;

    if (branchIds.find((branchId) => !cachedResults[branchId])) {
      isCacheMissing = true;
    }

    if (!isCacheMissing) {
      return branchIds.map((branchId) => cachedResults[branchId] as OBBranchSchemaType);
    }

    const branches = await getAllBranches(transactionId);

    logDebug(
      `[${transactionId}] [SERVICE] getAllBranchesByIds - All branches fetched by branchIds: ${JSON.stringify(
        branchIds,
      )}`,
    );

    const branchIdSet = new Set(branchIds);

    return branches.filter((branch) => branchIdSet.has(branch.branchId));
  } catch (getErr) {
    logError(`[${transactionId}] [SERVICE] getAllBranchesByIds - ERROR fetching branches, reason: ${getErr.message}`);
    throw getErr;
  }
};

const getAllDivisions = async (transactionId: string): Promise<OBDivisionSchemaType[]> => {
  try {
    logInfo(`[${transactionId}] [SERVICE] getAllDivisions - Fetch all divisions initiated`);

    const allDivisionsFromCache = (await cacheService.retrieve(transactionId, {
      serviceName: 'location_divisions',
      identifier: 'all',
    })) as OBDivisionSchemaType[] | null;

    if (allDivisionsFromCache?.length > 0) {
      logInfo(`[${transactionId}] [SERVICE] getAllDivisions - cached divisions returned`);

      return allDivisionsFromCache;
    }

    const obDivisionCursor = OBDivisionModel.find({}).cursor();

    const divisions: OBDivisionSchemaType[] = [];

    for await (const division of obDivisionCursor) {
      const { ...divisionData } = division.toJSON();
      divisions.push(divisionData);
    }

    logInfo(`[${transactionId}] [SERVICE] getAllDivisions - All divisions fetched`);

    await cacheService.persist(transactionId, {
      serviceName: 'location_divisions',
      identifier: 'all',
      data: divisions,
      expires: '2h',
    });

    await Promise.all(
      divisions.map((division) =>
        cacheService.persist(transactionId, {
          serviceName: 'location_divisions',
          identifier: division.divisionId,
          data: division,
          expires: '2h',
        }),
      ),
    );

    return divisions;
  } catch (getErr) {
    logError(`[${transactionId}] [SERVICE] getAllDivisions - ERROR fetching divisions, reason: ${getErr.message}`);
    throw getErr;
  }
};

const getAllDivisionByIds = async (transactionId: string, divisionIds: string[]): Promise<OBDivisionSchemaType[]> => {
  try {
    logInfo(`[${transactionId}] [SERVICE] getAllDivisionByIds - Fetch all divisions initiated`);

    if (divisionIds.includes('*')) {
      return getAllDivisions(transactionId);
    }

    const cachedResults = await cacheService.batchRetrieve(
      transactionId,
      divisionIds.map((divisionId) => ({
        serviceName: 'location_divisions',
        identifier: divisionId,
      })),
    );

    let isCacheMissing = false;

    if (divisionIds.find((divisionId) => !cachedResults[divisionId])) {
      isCacheMissing = true;
    }

    if (!isCacheMissing) {
      return divisionIds.map((divisionId) => cachedResults[divisionId] as OBDivisionSchemaType);
    }

    const divisions = await getAllDivisions(transactionId);

    const divisionIdSet = new Set(divisionIds);

    logInfo(
      `[${transactionId}] [SERVICE] getAllDivisionByIds - All divisions fetched by ids: ${JSON.stringify(divisionIds)}`,
    );

    return divisions.filter((division) => divisionIdSet.has(division.divisionId));
  } catch (getErr) {
    logError(`[${transactionId}] [SERVICE] getAllDivisionByIds - ERROR fetching divisions, reason: ${getErr.message}`);
    throw getErr;
  }
};

const getDefaultDivision = async (transactionId: string): Promise<OBDivisionSchemaType | null> => {
  const defaultDivisionName = 'Others';

  const allDivisions = await getAllDivisions(transactionId);

  const defaultDivision = allDivisions.find(
    (division) => division.divisionName.toLowerCase() === defaultDivisionName.toLowerCase(),
  );

  return defaultDivision;
};

const createDivision = async (transactionId: string, division: OBDivisionSchemaType): Promise<string> => {
  try {
    if (!division.divisionId || !division.divisionName) {
      throw new Error('Missing required fields');
    }

    logInfo(
      `[${transactionId}] [SERVICE] createDivision - create record initiated for divisionId: ${division.divisionId}`,
    );

    const newObDivision = await new OBDivisionModel(division).save();

    const { divisionId } = newObDivision.toJSON();

    logInfo(
      `[${transactionId}] [SERVICE] createDivision - create record SUCCESSFUL for divisionId: ${division.divisionId}`,
    );

    await cacheService.remove(transactionId, {
      serviceName: 'location_divisions',
      identifier: 'all',
    });

    return divisionId;
  } catch (createErr) {
    logError(
      `[${transactionId}] [SERVICE] createObUser - ERROR creating division for divisionId ${division.divisionId}, reason: ${createErr.message}`,
    );
    throw createErr;
  }
};

const updateDivision = async (transactionId: string, division: Partial<OBDivisionSchemaType>): Promise<string> => {
  try {
    if (!division.divisionId) {
      throw new Error('Missing required fields');
    }

    logInfo(
      `[${transactionId}] [SERVICE] updateDivision - update record initiated for divisionId: ${division.divisionId}`,
    );

    const newObDivision = await OBDivisionModel.findOneAndUpdate(
      {
        divisionId: division.divisionId,
      },
      {
        ...division,
        updatedAt: new Date(),
      },
      {
        new: true,
      },
    );

    const { divisionId } = newObDivision.toJSON();

    logInfo(
      `[${transactionId}] [SERVICE] updateDivision - update record SUCCESSFUL for divisionId: ${division.divisionId}`,
    );

    await cacheService.batchRemove(transactionId, [
      {
        serviceName: 'location_divisions',
        identifier: 'all',
      },
      {
        serviceName: 'location_divisions',
        identifier: division.divisionId,
      },
    ]);

    return divisionId;
  } catch (updateErr) {
    logError(
      `[${transactionId}] [SERVICE] updateDivision - ERROR updating division for divisionId ${division.divisionId}, reason: ${updateErr.message}`,
    );
    throw updateErr;
  }
};

const createBranch = async (transactionId: string, branchData: OBBranchSchemaType): Promise<string> => {
  try {
    logInfo(`[${transactionId}] [SERVICE] createBranch - create record initiated for branchId: ${branchData.branchId}`);

    if (
      !branchData.branchId ||
      !branchData.branchName ||
      !Array.isArray(branchData.divisionIds) ||
      branchData.divisionIds.length === 0
    ) {
      throw new Error('Missing mandatory fields for creating branch');
    }

    const insertObjBranch: OBBranchSchemaType = {
      branchName: branchData.branchName,
      branchId: branchData.branchId,
      description: branchData.description,
      city: branchData.city,
      province: branchData.province,
      postalCode: branchData.postalCode,
      address: branchData.address,
      locationId: branchData.locationId,
      divisionIds: branchData.divisionIds,
      legacyId: branchData.legacyId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const { branchId } = await new OBBranchModel(insertObjBranch).save();

    logInfo(
      `[${transactionId}] [SERVICE] createBranch - create record SUCCESSFUL for branchId: ${branchData.branchId}`,
    );

    await cacheService.remove(transactionId, {
      serviceName: 'location_branches',
      identifier: 'all',
    });

    return branchId;
  } catch (createErr) {
    logError(
      `[${transactionId}] [SERVICE] createBranch - ERROR creating branch for branchId ${branchData.branchId}, reason: ${createErr.message}`,
    );

    throw createErr;
  }
};

const updateBranch = async (
  transactionId: string,
  updatedBranchDetails: Partial<OBBranchSchemaType>,
): Promise<string> => {
  try {
    logInfo(
      `[${transactionId}] [SERVICE] updateBranch - update record initiated for BranchId: ${updatedBranchDetails.branchId}`,
    );

    if (!updatedBranchDetails.branchId) {
      throw new Error('Missing mandatory fields for creating branch');
    }

    const { branchId } = await OBBranchModel.findOneAndUpdate(
      {
        branchId: updatedBranchDetails.branchId,
      },
      {
        ...updatedBranchDetails,
        updatedAt: new Date(),
      },
      { new: true },
    );

    logInfo(
      `[${transactionId}] [SERVICE] updateBranch - update record SUCCESSFUL for BranchId: ${updatedBranchDetails.branchId}`,
    );

    await cacheService.batchRemove(transactionId, [
      {
        serviceName: 'location_branches',
        identifier: 'all',
      },
      {
        serviceName: 'location_branches',
        identifier: updatedBranchDetails.branchId,
      },
    ]);

    return branchId;
  } catch (updateErr) {
    logError(
      `[${transactionId}] [SERVICE] updateBranch - ERROR updating branch for BranchId ${updatedBranchDetails.branchId}, reason: ${updateErr.message}`,
    );

    throw updateErr;
  }
};

const createOrUpdateMultipleObBranchDivisions = async (
  transactionId: string,
  branchDivisions: Partial<OBBranchDivisionUpsertOperationType>[],
): Promise<{
  successful: string[];
  failed: string[];
}> => {
  try {
    logInfo(`[${transactionId}] [Service] [createOrUpdateMultipleObBranchDivisions] Initiated`);

    const uniqueValidDivisionMap = new Map<string, Partial<OBDivisionSchemaType>>();
    const validBranches: Partial<OBBranchSchemaType>[] = [];
    const validBranchIds: string[] = [];

    branchDivisions.forEach((branchDivision) => {
      if (branchDivision.branchId) {
        validBranchIds.push(branchDivision.branchId);
        const [branch, divisions] = mapBranchOperationTypeToDbRecord(branchDivision);
        validBranches.push(branch);
        divisions.forEach((division) => {
          uniqueValidDivisionMap.set(division.divisionId, division);
        });
      }
    });

    const validDivisionIds = [...uniqueValidDivisionMap.keys()];

    const [existingBranches, existingDivisions] = await Promise.all([
      getAllBranchesByIds(transactionId, validBranchIds),
      getAllDivisionByIds(transactionId, validDivisionIds),
    ]);

    const branchHash: {
      [key: string]: OBBranchSchemaType;
    } = {};
    const divisionHash: {
      [key: string]: OBDivisionSchemaType;
    } = {};

    existingBranches.forEach((existingBranch) => {
      branchHash[existingBranch.branchId] = existingBranch;
    });

    existingDivisions.forEach((existingDivision) => {
      divisionHash[existingDivision.divisionId] = existingDivision;
    });

    const branchesToCreate: OBBranchSchemaType[] = [];
    const branchesToUpdate: Partial<OBBranchSchemaType>[] = [];
    const divisionsToCreate: OBDivisionSchemaType[] = [];
    const divisionsToUpdate: Partial<OBDivisionSchemaType>[] = [];

    validBranches.forEach((validBranch) => {
      if (branchHash[validBranch.branchId]) {
        branchesToUpdate.push(validBranch);

        return;
      }

      branchesToCreate.push(validBranch as OBBranchSchemaType);
    });

    validDivisionIds.forEach((validDivisionId) => {
      if (divisionHash[validDivisionId]) {
        divisionsToUpdate.push(uniqueValidDivisionMap.get(validDivisionId));

        return;
      }

      divisionsToCreate.push(uniqueValidDivisionMap.get(validDivisionId) as OBDivisionSchemaType);
    });

    const mongoResults = await Promise.allSettled([
      ...branchesToCreate.map((branch) => createBranch(transactionId, branch)),
      ...branchesToUpdate.map((branch) => updateBranch(transactionId, branch)),
      ...divisionsToCreate.map((division) => createDivision(transactionId, division)),
      ...divisionsToUpdate.map((division) => updateDivision(transactionId, division)),
    ]);

    const stats = {
      successful: new Set<string>(),
      failed: new Set<string>(),
    };

    mongoResults.forEach((mongoResult) => {
      if (mongoResult.status === 'rejected') {
        logError(
          `[${transactionId}] [Service] [createOrUpdateMultipleObBranchDivisions] Error writing to mongo, reason: ${mongoResult.reason}`,
        );

        return;
      }
      stats.successful.add(mongoResult.value);
    });

    [...validBranchIds, ...validDivisionIds].forEach((id) => {
      if (!stats.successful.has(id)) {
        stats.failed.add(id);
      }
    });

    return {
      successful: [...stats.successful],
      failed: [...stats.failed],
    };
  } catch (err) {
    logError(`[${transactionId}] [SERVICE] createOrUpdateMultipleObBranchDivisions ERROR, reason: ${err.message}`);

    throw err;
  }
};

const getBranchDetailsById = async (
  transactionId: string,
  branchId: string,
): Promise<OBBranchDetailedOperationType> => {
  const [branch] = await getAllBranchesByIds(transactionId, [branchId]);

  if (!branch) {
    throw new Error('Branch unfounded in the system');
  }

  const divisions = await getAllDivisionByIds(transactionId, branch.divisionIds);

  const divisionHash: {
    [divisionId: string]: OBDivisionSchemaType;
  } = {};

  divisions.forEach((division) => {
    divisionHash[division.divisionId] = division;
  });

  // TODO Code duplication needs to be addressed later
  const {
    branchName,
    city,
    province,
    branchPhone,
    branchEmail,
    availStartTime,
    availEndTime,
    divisionIds,
    departmentNames,
    legacyId,
    locationId,
    address,
    tollFreePhone,
    branchManagerPsIds,
  } = branch;

  const branchDivisions = [];

  divisionIds.forEach((divisionId) => {
    if (divisionHash[divisionId]) {
      branchDivisions.push({
        divisionId: divisionHash[divisionId].divisionId,
        divisionName: divisionHash[divisionId].divisionName,
        legacyDivisionCMSId: divisionHash[divisionId].legacyId,
      });
    }
  });

  return {
    legacyBranchCMSId: legacyId,
    branchId,
    branchName,
    city,
    province,
    branchPhone,
    branchEmail,
    availStartTime,
    availEndTime,
    departmentNames,
    locationId,
    divisionIds,
    divisions: branchDivisions,
    address,
    tollFreePhone,
    branchManagerPsIds,
  };
};

const getAllBranchesWithDivisions = async (transactionId: string): Promise<OBBranchDetailedOperationType[]> => {
  const [branches, divisions] = await Promise.all([getAllBranches(transactionId), getAllDivisions(transactionId)]);

  const divisionHash: {
    [divisionId: string]: OBDivisionSchemaType;
  } = {};

  divisions.forEach((division) => {
    divisionHash[division.divisionId] = division;
  });

  return branches.map((branch) => {
    const {
      branchId,
      branchName,
      city,
      address,
      province,
      branchPhone,
      branchEmail,
      availStartTime,
      availEndTime,
      divisionIds,
      departmentNames,
      legacyId,
      locationId,
      tollFreePhone,
      branchManagerPsIds,
    } = branch;

    const branchDivisions = [];

    divisionIds.forEach((divisionId) => {
      if (divisionHash[divisionId]) {
        branchDivisions.push({
          divisionId: divisionHash[divisionId].divisionId,
          divisionName: divisionHash[divisionId].divisionName,
          legacyDivisionCMSId: divisionHash[divisionId].legacyId,
        });
      }
    });

    return {
      legacyBranchCMSId: legacyId,
      branchId,
      branchName,
      city,
      address,
      province,
      departmentNames,
      locationId,
      branchPhone,
      branchEmail,
      availStartTime,
      availEndTime,
      divisionIds,
      divisions: branchDivisions,
      tollFreePhone,
      branchManagerPsIds,
    };
  });
};

const getAllBranchesWithDivisionsV2 = async (transactionId: string): Promise<OBBranchDetailedOperationType[]> => {
  const [branches, divisions] = await Promise.all([getAllBranches(transactionId), getAllDivisions(transactionId)]);

  // Use a Map for faster lookups
  const divisionMap = new Map<string, OBDivisionSchemaType>(
    divisions.map((division) => [division.divisionId, division]),
  );

  return branches.map((branch) => {
    const {
      branchId,
      branchName,
      city,
      address,
      province,
      branchPhone,
      branchEmail,
      availStartTime,
      availEndTime,
      divisionIds,
      departmentNames,
      legacyId,
      locationId,
      tollFreePhone,
      branchManagerPsIds,
    } = branch;

    const branchDivisions: { divisionId: string; divisionName: string; legacyDivisionCMSId?: string }[] = [];

    divisionIds.forEach((divisionId) => {
      const division = divisionMap.get(divisionId);
      if (division) {
        branchDivisions.push({
          divisionId: division.divisionId,
          divisionName: division.divisionName,
          legacyDivisionCMSId: division.legacyId,
        });
      }
    });

    return {
      legacyBranchCMSId: legacyId,
      branchId,
      branchName,
      city,
      address,
      province,
      departmentNames,
      locationId,
      branchPhone,
      branchEmail,
      availStartTime,
      availEndTime,
      divisionIds,
      divisions: branchDivisions,
      tollFreePhone,
      branchManagerPsIds,
    };
  });
};

type NewLocationType = {
  locationId: string;
  locationCity: string;
  locationDescription?: string;
  locationProvince?: string;
};

const createBranchForUnknownLocation = async (
  transactionId: string,
  locationId: string,
  locationDetail: NewLocationType,
): Promise<void> => {
  logInfo(
    `[${transactionId}] [Service] [createBranchForUnknownLocation] Initiated, locationId: ${locationId}, locationDetails: ${JSON.stringify(
      locationDetail,
    )}`,
  );

  const defaultDivision = await getDefaultDivision(transactionId);

  const allBranches = await getAllBranches(transactionId);

  const [lastInsertedBranch] = [
    ...allBranches.sort((branchA, branchB) => parseInt(branchB.branchId, 10) - parseInt(branchA.branchId, 10)),
  ];

  // Reason: The branch id pattern is 100, 101, 102, 103, etc and to maintain consistency
  const assumedBranchId = `${parseInt(lastInsertedBranch.branchId, 10) + 1}`;

  const assumedBranchName = `${
    locationDetail.locationDescription ?? locationDetail.locationCity
  } - OB${assumedBranchId}`;

  logInfo(
    `[${transactionId}] [Service] [createBranchForUnknownLocation] Assumed branchId: ${assumedBranchId} and branchName: ${assumedBranchName} for locationId: ${locationId}`,
  );

  const result = await createOrUpdateMultipleObBranchDivisions(transactionId, [
    {
      locationId,
      branchId: assumedBranchId,
      branchName: assumedBranchName,
      city: locationDetail.locationCity,
      province: locationDetail.locationProvince,
      description: locationDetail.locationDescription,
      divisions: [defaultDivision],
    },
  ]);

  if (result.failed.length > 0 && result.successful.length === 0) {
    logError(
      `[${transactionId}] [Service] [createBranchForUnknownLocation] Assumed branch creation FAILED, details: ${JSON.stringify(
        result.failed,
      )}`,
    );

    return;
  }

  logInfo(
    `[${transactionId}] [Service] [createBranchForUnknownLocation] Assumed branch creation SUCCESSFUL, details: ${JSON.stringify(
      result.successful,
    )}`,
  );
};

const getBranchDetailsByLocationId = async (
  transactionId: string,
  locationId: string,
  locationDetail?: NewLocationType,
): Promise<OBBranchDetailedOperationType> => {
  logInfo(`[${transactionId}] [SERVICE] getBranchDetailsByLocationId - Fetch all branches initiated`);

  let [branch] = await OBBranchModel.find({ locationId });

  if (!branch && !locationDetail) {
    throw new Error('Branch not found in the system');
  } else if (!branch && locationDetail) {
    logInfo(
      `[${transactionId}] [SERVICE] getBranchDetailsByLocationId - Unknown locationId ${locationId} found, auto create branch`,
    );
    await createBranchForUnknownLocation(transactionId, locationId, locationDetail);

    [branch] = await OBBranchModel.find({ locationId });

    logInfo(
      `[${transactionId}] [SERVICE] getBranchDetailsByLocationId - New branch ${branch.branchId} mapped for locationId ${locationId}`,
    );
  }

  const divisions = await getAllDivisionByIds(transactionId, branch.divisionIds);

  const divisionHash: {
    [divisionId: string]: OBDivisionSchemaType;
  } = {};

  divisions.forEach((division) => {
    divisionHash[division.divisionId] = division;
  });

  const { branchId, branchName, city, province, divisionIds, departmentNames, legacyId } = branch;

  const branchDivisions = [];

  divisionIds.forEach((divisionId) => {
    if (divisionHash[divisionId]) {
      branchDivisions.push({
        divisionId: divisionHash[divisionId].divisionId,
        divisionName: divisionHash[divisionId].divisionName,
        legacyDivisionCMSId: divisionHash[divisionId].legacyId,
      });
    }
  });

  return {
    legacyBranchCMSId: legacyId,
    branchId,
    branchName,
    city,
    province,
    departmentNames,
    locationId,
    divisionIds,
    divisions,
  };
};

const removeBranchByBranchId = async (transactionId: string, removeBranchId: string): Promise<string> => {
  logInfo(`[${transactionId}] [SERVICE] getBranchDetailsByLocationId - Fetch all branches initiated`);

  const branch = await getBranchDetailsById(transactionId, removeBranchId);

  if (!branch) {
    throw new Error('Branch not found in the system');
  }

  const { deletedCount } = await OBBranchModel.deleteOne({
    branchId: removeBranchId,
  });

  if (!deletedCount) {
    throw new Error('Unable to remove the selected branch');
  }

  return removeBranchId;
};

export {
  createOrUpdateMultipleObBranchDivisions,
  getAllDivisions,
  getAllDivisionByIds,
  getAllBranches,
  getBranchDetailsById,
  getAllBranchesWithDivisions,
  getAllBranchesByIds,
  getBranchDetailsByLocationId,
  removeBranchByBranchId,
  getAllBranchesWithDivisionsV2,
};
