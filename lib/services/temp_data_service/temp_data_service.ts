import { FilterQuery, PipelineStage, QueryOptions, SortOrder } from 'mongoose';
import * as semver from 'semver';
import { TempDataValueEnum } from '../../enums';
import { logInfo, logWarn, logError, logDebug } from '../../log/util';
import { OBTempDataModel } from '../../models';
import { OBTempDataSchemaType, TempDataUpsertOperationType, OBIdBadgeSummaryDataType } from '../../types';
import { mapTempRequestToDBRecord } from '../../utils';

const getTempDatas = async (
  transactionId: string,
  primaryIdentifier: string,
  valueType: TempDataValueEnum,
  filters?: Partial<OBTempDataSchemaType>,
  options?: {
    limit: number;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
  },
): Promise<OBTempDataSchemaType[]> => {
  logInfo(
    `[${transactionId}] [SERVICE] getTempDatas - Getting temp datas by valueType: ${valueType} and primaryIdentifier: ${primaryIdentifier}`,
  );

  try {
    const sortQuery = (
      options?.sortField ? { [options.sortField]: options.sortOrder === 'asc' ? 1 : -1 } : { updatedAt: -1 }
    ) as { [key: string]: SortOrder };

    const dbTempData = OBTempDataModel.find({
      primaryIdentifier,
      valueType,
      ...filters,
    })
      .sort(sortQuery)
      .limit(options?.limit ?? 1)
      .cursor();

    const tempData: OBTempDataSchemaType[] = [];

    for await (const datum of dbTempData) {
      tempData.push(datum.toJSON() as OBTempDataSchemaType);
    }

    if (tempData.length === 0) {
      logWarn(
        `[${transactionId}] [SERVICE] getTempDatas - No temp data found for valueType: ${valueType} and primaryIdentifier: ${primaryIdentifier}`,
      );
    }

    return tempData;
  } catch (getErr) {
    logError(
      `[${transactionId}] [SERVICE] getTempDatas - FAILED for valueType: ${valueType} and primaryIdentifier: ${primaryIdentifier}, reason: ${getErr.message}`,
    );

    throw getErr;
  }
};

const getBatchTempData = async (
  transactionId: string,
  batchIdentifiers: { valueType: TempDataValueEnum; primaryIdentifiers: string[] }[],
): Promise<OBTempDataSchemaType[]> => {
  logInfo(`[${transactionId}] [SERVICE] getBatchTempData - Getting batch of temp datas`);

  try {
    const aggregateStages: PipelineStage[] = [
      {
        $match: {
          $or: batchIdentifiers.map((batchIdentifier) => {
            return {
              $and: [
                { valueType: batchIdentifier.valueType },
                { primaryIdentifier: { $in: batchIdentifier.primaryIdentifiers } },
              ],
            };
          }),
        },
      },
      {
        $group: {
          _id: ['$valueType', '$primaryIdentifier'],
          tempDataObject: {
            $top: {
              output: {
                primaryIdentifier: '$primaryIdentifier',
                valueType: '$valueType',
                payload: '$payload',
                valueStatus: '$valueStatus',
                version: '$version',
                comment: '$comment',
                createdAt: '$createdAt',
                updatedAt: '$updatedAt',
              },
              sortBy: { updatedAt: -1 },
            },
          },
        },
      },
    ];

    const tempData: OBTempDataSchemaType[] = [];

    const dbTempData = await OBTempDataModel.aggregate(aggregateStages);

    for await (const datum of dbTempData) {
      tempData.push(datum.tempDataObject as OBTempDataSchemaType);
    }
    if (tempData.length === 0) {
      logWarn(`[${transactionId}] [SERVICE] getBatchTempData - No temp data found.`);
    } else {
      logInfo(`[${transactionId}] [SERVICE] getBatchTempData - SUCCESSFULLY found ${tempData.length} temp data`);
    }

    return tempData;
  } catch (getErr) {
    logError(`[${transactionId}] [SERVICE] getBatchTempData - FAILED , reason: ${getErr.message}`);

    throw getErr;
  }
};

const getLatestDraft = async (
  transactionId: string,
  primaryIdentifier: string,
  valueType: string,
): Promise<OBTempDataSchemaType> => {
  logInfo(
    `[${transactionId}] [SERVICE] getLatestDraft - Get most recent draft for valueType: ${valueType}, primaryIdentifier: ${primaryIdentifier}`,
  );

  const versionedTempRecords = OBTempDataModel.find({
    valueType,
    primaryIdentifier,
  })
    .sort({ updatedAt: -1 })
    .limit(10)
    .cursor();

  const recentlyUpdatedVersions: OBTempDataSchemaType[] = [];

  for await (const versionedTempRecord of versionedTempRecords) {
    recentlyUpdatedVersions.push(versionedTempRecord.toJSON() as OBTempDataSchemaType);
  }

  const [mostRecentDraft = null] = recentlyUpdatedVersions.sort((versionA, versionB) => {
    if (!semver.valid(versionA.version) || !semver.valid(versionB.version)) {
      return 0;
    }

    // Return the list in descending order based on versions
    return semver.rcompare(versionA.version, versionB.version);
  });

  if (!mostRecentDraft) {
    logWarn(
      `[${transactionId}] [SERVICE] getLatestDraft - No previous versions found for valueType: ${valueType} and primaryIdentifier: ${primaryIdentifier}`,
    );
  }

  return mostRecentDraft;
};

const addTempData = async (
  transactionId: string,
  tempData: TempDataUpsertOperationType,
  options?: { shouldOverride?: boolean; overrideVersion?: string },
): Promise<{
  valueType: TempDataValueEnum;
  primaryIdentifier: string;
  secondaryIdentifier?: string;
  version: string;
}> => {
  const { primaryIdentifier, secondaryIdentifier, valueType } = tempData;

  try {
    if (!primaryIdentifier || !valueType) {
      throw new Error('Required fields are missing');
    }

    logInfo(
      `[${transactionId}] [SERVICE] addTempData - Adding temp data for valueType: ${valueType}, primaryIdentifier: ${primaryIdentifier}, secondaryIdentifier: ${secondaryIdentifier}`,
    );

    const previousTempDataVersion = await getLatestDraft(transactionId, primaryIdentifier, valueType);

    let nextVersion: string;

    switch (true) {
      case Boolean(options?.overrideVersion):
        // Other features can override default versioning
        nextVersion = semver.coerce(options.overrideVersion).toString();
        break;
      case Boolean(previousTempDataVersion?.version):
        nextVersion = semver.coerce(semver.inc(previousTempDataVersion.version, 'patch')).toString();
        break;
      default:
        nextVersion = semver.coerce('1').toString();
    }

    const mappedTempData = mapTempRequestToDBRecord(tempData);

    if (options?.shouldOverride && previousTempDataVersion?.version) {
      logInfo(
        `[${transactionId}] [SERVICE] addTempData - Overriding temp data version ${previousTempDataVersion.version} to ${nextVersion} for valueType: ${valueType}, primaryIdentifier: ${primaryIdentifier}, secondaryIdentifier: ${secondaryIdentifier}`,
      );

      const updatedRecord = await OBTempDataModel.findOneAndUpdate(
        {
          primaryIdentifier,
          ...(secondaryIdentifier && { secondaryIdentifier }),
          valueType,
          version: previousTempDataVersion.version,
        },
        {
          ...mappedTempData,
          version: nextVersion,
          updatedAt: new Date(),
        },
        { new: true },
      );

      logInfo(
        `[${transactionId}] [SERVICE] addTempData - Overriding temp data SUCCESSFUL ${nextVersion} for valueType: ${valueType}, primaryIdentifier: ${primaryIdentifier}, secondaryIdentifier: ${secondaryIdentifier}`,
      );

      return {
        primaryIdentifier,
        ...(secondaryIdentifier && { secondaryIdentifier }),
        valueType: valueType as TempDataValueEnum,
        version: updatedRecord.version,
      };
    }

    logInfo(
      `[${transactionId}] [SERVICE] addTempData - Creating new temp data version ${nextVersion} for valueType: ${valueType}, primaryIdentifier: ${primaryIdentifier}, secondaryIdentifier: ${secondaryIdentifier}`,
    );

    const createdRecord = await new OBTempDataModel({
      ...mappedTempData,
      version: nextVersion,
    }).save();

    logInfo(
      `[${transactionId}] [SERVICE] addTempData - New temp data SUCCESSFUL ${nextVersion} for valueType: ${valueType}, primaryIdentifier: ${primaryIdentifier}, secondaryIdentifier: ${secondaryIdentifier}`,
    );

    return {
      primaryIdentifier,
      ...(secondaryIdentifier && { secondaryIdentifier }),
      valueType: valueType as TempDataValueEnum,
      version: createdRecord.version,
    };
  } catch (addErr) {
    logError(
      `[${transactionId}] [SERVICE] addTempData - FAILED for valueType: ${valueType}, primaryIdentifier: ${primaryIdentifier}, secondaryIdentifier: ${secondaryIdentifier}, reason: ${addErr.message}`,
    );
    logDebug(`[${transactionId}] [SERVICE] addTempData - FAILED details, provided: ${JSON.stringify(tempData)}`);

    throw addErr;
  }
};

const getTempDataByFilter = async (
  transactionId: string,
  filters?: FilterQuery<OBTempDataSchemaType>,
  options?: QueryOptions<OBTempDataSchemaType>,
): Promise<OBTempDataSchemaType[]> => {
  logInfo(
    `[${transactionId}] [SERVICE] getTempDataByFilter - find all Temp data by filters: ${JSON.stringify(
      filters,
    )}, options: ${JSON.stringify(options)}`,
  );

  try {
    const tempData: OBTempDataSchemaType[] = [];

    const dbTempData = OBTempDataModel.find(filters, {}, options).cursor();

    for await (const datum of dbTempData) {
      tempData.push(datum.toJSON() as OBTempDataSchemaType);
    }

    logInfo(
      `[${transactionId}] [SERVICE] getTempDataByFilter - total resources retrieved filters: ${JSON.stringify(
        filters,
      )}`,
    );

    return tempData;
  } catch (getErr) {
    logError(`[${transactionId}] [SERVICE] getTempDataByFilter - FAILED,  reason: ${getErr.message}`);

    throw getErr;
  }
};

const deleteTempData = async (
  transactionId: string,
  primaryIdentifier: string,
  valueType: string,
  deleteAllVersions = true,
  version?: string,
): Promise<{ isDeleted: boolean; valueType: string; primaryIdentifier: string; version: string }> => {
  try {
    logInfo(
      `[${transactionId}] [SERVICE] deleteTempData - deleting temp data for value type: ${valueType}, primaryIdentifier: ${primaryIdentifier}`,
    );
    let deletedCount = 0;

    if (deleteAllVersions) {
      ({ deletedCount } = await OBTempDataModel.deleteMany({
        valueType,
        primaryIdentifier,
      }));
    } else {
      if (!version) {
        logWarn(
          `[${transactionId}] [SERVICE] deleteTempData - No version provided, will find the most recent version and delete it.`,
        );
        const previousDraft = await getLatestDraft(transactionId, primaryIdentifier, valueType);

        version = previousDraft?.version;
      }

      ({ deletedCount } = await OBTempDataModel.deleteOne({
        valueType,
        primaryIdentifier,
        version,
      }));
    }

    logInfo(
      `[${transactionId}] [SERVICE] deleteTempData - SUCCESSFUL for value type: ${valueType}, primaryIdentifier: ${primaryIdentifier},  version: ${
        deleteAllVersions ? 'all' : version
      }`,
    );

    return {
      isDeleted: deletedCount > 0,
      valueType,
      primaryIdentifier,
      version: deleteAllVersions ? 'all' : version,
    };
  } catch (deleteErr) {
    logError(
      `[${transactionId}] [SERVICE] deleteTempData - FAILED for value type: ${valueType}, primaryIdentifier: ${primaryIdentifier}, reason: ${deleteErr.message}`,
    );

    throw deleteErr;
  }
};

const getImageModerationData = async (
  transactionId: string,
  start: Date,
  end: Date,
): Promise<OBIdBadgeSummaryDataType[]> => {
  logInfo(`[${transactionId}] [SERVICE] getImageModerationData - Retrieving image moderation data, ${start}, ${end}`);

  try {
    const aggregationPipeline: PipelineStage[] = [
      {
        $match: {
          valueType: 'ImageModeration',
          updatedAt: { $gte: start, $lte: end },
        },
      },
      {
        $unwind: '$payload.branchIds',
      },
      {
        $sort: { updatedAt: -1 }, // Sort by latest submission date
      },
      {
        $group: {
          _id: '$payload.branchIds',
          branchId: { $first: '$payload.branchIds' },
          totalPending: {
            $sum: { $cond: [{ $eq: ['$valueStatus', 'Pending'] }, 1, 0] },
          },
          approvedInRange: {
            $sum: { $cond: [{ $eq: ['$valueStatus', 'Approved'] }, 1, 0] },
          },
          rejectedInRange: {
            $sum: { $cond: [{ $eq: ['$valueStatus', 'Rejected'] }, 1, 0] },
          },
          latestSubmission: {
            $first: {
              userPsId: '$payload.userPsId',
              userName: '$payload.userName',
              updatedAt: '$updatedAt',
            },
          },
        },
      },
      {
        $project: {
          branchId: '$_id',
          totalPending: 1,
          approvedInRange: 1,
          rejectedInRange: 1,
          latestSubmission: 1,
        },
      },
    ];

    const aggregationResults = await OBTempDataModel.aggregate(aggregationPipeline);

    // Map results to the required format
    const result = aggregationResults.map((data) => ({
      branchId: data.branchId,
      totalPending: data.totalPending ?? 0,
      approvedInRange: data.approvedInRange ?? 0,
      rejectedInRange: data.rejectedInRange ?? 0,
      latestSubmission: data.latestSubmission ?? null,
    }));

    logInfo(
      `[${transactionId}] [SERVICE] getImageModerationData - Successfully retrieved data, ${JSON.stringify(result)}`,
    );

    return result;
  } catch (error) {
    logError(`[${transactionId}] [SERVICE] getImageModerationData - FAILED due to error: ${error.message}`);
    throw error;
  }
};

// TODO Add logs and probably use version check if required
const getTempDataBySecondaryId = async (
  transactionId: string,
  valueType: TempDataValueEnum,
  secondaryIdentifier: string,
  { startDate, endDate }: { startDate: Date; endDate: Date },
  options?: {
    limit?: number;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
  },
): Promise<OBTempDataSchemaType[]> => {
  logInfo(
    `[${transactionId}] [SERVICE] getTempDataBySecondaryId - Fetching temp data by valueType: ${valueType} and secondaryIdentifier: ${secondaryIdentifier}`,
  );

  try {
    const sortQuery = (
      options?.sortField ? { [options.sortField]: options.sortOrder === 'asc' ? 1 : -1 } : { updatedAt: -1 }
    ) as { [key: string]: SortOrder };

    const dbTempData = OBTempDataModel.find({
      valueType,
      secondaryIdentifier,
      updatedAt: {
        $gte: startDate,
        $lte: endDate,
      },
    })
      .sort(sortQuery)
      .limit(options?.limit ?? 20)
      .cursor();

    const tempDatas: OBTempDataSchemaType[] = [];

    for await (const datum of dbTempData) {
      tempDatas.push(datum.toJSON() as OBTempDataSchemaType);
    }

    logInfo(`[${transactionId}] [SERVICE] getTempDataBySecondaryId - Total resources retrieved: ${tempDatas.length}`);

    if (tempDatas.length === 0) {
      logWarn(
        `[${transactionId}] [SERVICE] getTempDataBySecondaryId - No temp data found for valueType: ${valueType} and secondaryIdentifier: ${secondaryIdentifier}`,
      );
    }

    return tempDatas;
  } catch (getErr) {
    logError(
      `[${transactionId}] [SERVICE] getTempDataBySecondaryId - FAILED for valueType: ${valueType} and secondaryIdentifier: ${secondaryIdentifier}, reason: ${getErr.message}`,
    );

    throw getErr;
  }
};

export {
  getTempDatas,
  addTempData,
  deleteTempData,
  getTempDataByFilter,
  getBatchTempData,
  getImageModerationData,
  getLatestDraft,
  getTempDataBySecondaryId,
};
