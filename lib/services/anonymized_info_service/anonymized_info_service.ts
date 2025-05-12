import { FilterQuery, PipelineStage } from 'mongoose';
import { AnonymizedTypeEnum } from '../../enums';
import { logInfo, logError } from '../../log/util';
import { OBAnonymizedInfoModel } from '../../models';
import { OBAnonymizedInfoCreateOperationType, OBAnonymizedInfoSchemaType } from '../../types';
import * as locationService from '../location_service/location_service';
const createOBAnonymizedInfo = async (
  transactionId: string,
  anonymizedInfoData: OBAnonymizedInfoCreateOperationType,
): Promise<{ identifier: string }> => {
  try {
    // Check if all required fields are present
    if (
      !anonymizedInfoData.identifier ||
      !anonymizedInfoData.infoKey ||
      !anonymizedInfoData.infoValue ||
      !anonymizedInfoData.infoType
    ) {
      throw new Error('Missing required fields: identifier, infoKey, infoValue, infoType');
    }

    logInfo(
      `[${transactionId}] [SERVICE] createOBAnonymizedInfo - create record initiated for identifier: ${anonymizedInfoData.identifier}`,
    );

    // Assign timestamps
    const now = new Date();
    const anonymizedInfo = {
      ...anonymizedInfoData,
      // TODO: Remove after migration
      createdAt: anonymizedInfoData.createdAt ?? now,
      updatedAt: now,
    };

    // Create a new document in the database using the provided data
    const newOBAnonymizedInfo = new OBAnonymizedInfoModel(anonymizedInfo);
    await newOBAnonymizedInfo.save();

    logInfo(
      `[${transactionId}] [SERVICE] createOBAnonymizedInfo - create record SUCCESSFUL for identifier: ${anonymizedInfoData.identifier}`,
    );

    return { identifier: anonymizedInfoData.identifier };
  } catch (error) {
    logError(
      `[${transactionId}] [SERVICE] createOBAnonymizedInfo - ERROR creating record for identifier ${anonymizedInfoData.identifier}, reason: ${error.message}`,
    );
    throw error;
  }
};

const updateOBAnonymizedInfo = async (
  transactionId: string,
  anonymizedInfoData: OBAnonymizedInfoCreateOperationType,
): Promise<{ identifier: string }> => {
  try {
    if (
      !anonymizedInfoData.identifier ||
      !anonymizedInfoData.infoKey ||
      !anonymizedInfoData.infoValue ||
      !anonymizedInfoData.infoType
    ) {
      throw new Error('Missing required fields: identifier, infoKey, infoValue, infoType');
    }

    logInfo(
      `[${transactionId}] [SERVICE] updateOBAnonymizedInfo - update record initiated for identifier: ${anonymizedInfoData.identifier}`,
    );

    await OBAnonymizedInfoModel.findOneAndUpdate(
      {
        identifier: anonymizedInfoData.identifier,
      },
      {
        ...anonymizedInfoData,
        updatedAt: new Date(),
      },
      { new: true },
    );

    logInfo(
      `[${transactionId}] [SERVICE] updateOBAnonymizedInfo - update record SUCCESSFUL for identifier: ${anonymizedInfoData.identifier}`,
    );

    return { identifier: anonymizedInfoData.identifier };
  } catch (error) {
    logError(
      `[${transactionId}] [SERVICE] updateOBAnonymizedInfo - ERROR updating record for identifier ${anonymizedInfoData.identifier}, reason: ${error.message}`,
    );
    throw error;
  }
};

const getPreviousAnonEntryByIdAndKeyType = async (
  transactionId: string,
  { identifier, infoKey, infoType }: { identifier: string; infoKey: string; infoType: string },
): Promise<OBAnonymizedInfoSchemaType | null> => {
  try {
    if (!identifier || !infoKey || !infoType) {
      throw new Error('Missing required fields: identifier, infoKey, infoType');
    }

    logInfo(
      `[${transactionId}] [SERVICE] getPreviousAnonEntryByIdAndKeyType - find previous anon record for identifier: ${identifier}`,
    );

    const anonQueryCursor = await OBAnonymizedInfoModel.find({
      identifier,
      infoKey,
      infoType,
    });

    const anonRecords: OBAnonymizedInfoSchemaType[] = [];

    for await (const anon of anonQueryCursor) {
      anonRecords.push(anon.toJSON());
    }

    const [matchingRecord = null] = anonRecords;

    if (matchingRecord) {
      logInfo(
        `[${transactionId}] [SERVICE] getPreviousAnonEntryByIdAndKeyType - previous entry found for identifier: ${identifier}`,
      );
    }

    return matchingRecord;
  } catch (fetchErr) {
    logError(
      `[${transactionId}] [SERVICE] getPreviousAnonEntryByIdAndKeyType - ERROR fetching for identifier ${identifier}, reason: ${fetchErr.message}`,
    );

    throw fetchErr;
  }
};

const getReferralsByFilter = async (
  transactionId: string,
  filters: FilterQuery<OBAnonymizedInfoSchemaType>,
  options?: {
    limit: number;
    skip: number;
    search?: string;
  },
): Promise<OBAnonymizedInfoSchemaType[]> => {
  logInfo(
    `[${transactionId}] [SERVICE] getReferralsByFilter - find all referrals by infoKey: ${JSON.stringify(
      filters,
    )}, options: ${JSON.stringify(options)}`,
  );

  const searchQuery: FilterQuery<OBAnonymizedInfoSchemaType> = {};
  if (options && options.search) {
    const searchRegex = new RegExp(options.search, 'i');
    searchQuery.$or = [
      { infoValue: searchRegex },
      { 'payload.city': searchRegex },
      { 'payload.jobPosition': searchRegex },
      { 'payload.skills': searchRegex },
      { 'payload.referredByName': searchRegex },
    ];
  }

  try {
    const referrals: OBAnonymizedInfoSchemaType[] = [];

    const referralsCursor = OBAnonymizedInfoModel.find(
      {
        ...filters,
        infoType: 'referral',
        ...searchQuery,
      },
      {},
      {
        sort: {
          createdAt: -1,
        },
      },
    )
      .skip(options.skip)
      .limit(options.limit)
      .cursor();

    for await (const failedLogin of referralsCursor) {
      referrals.push(failedLogin.toJSON());
    }

    logInfo(`[${transactionId}] [SERVICE] getReferralsByFilter - referrals retrieved`);

    return referrals;
  } catch (listErr) {
    logError(`[${transactionId}] [SERVICE] getReferralsByFilter - FAILED,  reason: ${listErr.message}`);
    throw listErr;
  }
};

const getConcernsByFilter = async (
  transactionId: string,
  options?: {
    limit: number;
    skip: number;
    search?: string;
  },
): Promise<OBAnonymizedInfoSchemaType[]> => {
  logInfo(`[${transactionId}] [SERVICE] getConcernsByFilter - find all concerns, options: ${JSON.stringify(options)}`);

  const searchQuery: FilterQuery<OBAnonymizedInfoSchemaType> = {};
  if (options && options.search) {
    const searchRegex = new RegExp(options.search, 'i');
    searchQuery.$or = [
      { infoValue: searchRegex },
      { 'payload.concern': searchRegex },
      { 'payload.concernedUserName': searchRegex },
    ];
  }

  try {
    const concerns: OBAnonymizedInfoSchemaType[] = [];

    const concernsCursor = OBAnonymizedInfoModel.find(
      {
        infoKey: AnonymizedTypeEnum.Concern,
        infoType: 'concern',
        ...searchQuery,
      },
      {},
      {
        sort: {
          createdAt: -1,
        },
      },
    )
      .skip(options.skip)
      .limit(options.limit)
      .cursor();

    for await (const concern of concernsCursor) {
      concerns.push(concern.toJSON());
    }

    logInfo(`[${transactionId}] [SERVICE] getConcernsByFilter - concerns retrieved`);

    return concerns;
  } catch (listErr) {
    logError(`[${transactionId}] [SERVICE] getConcernsByFilter - FAILED, reason: ${listErr.message}`);
    throw listErr;
  }
};

const getFailedLoginsByDate = async (
  transactionId: string,
  {
    attemptStartDate,
    attemptEndDate,
  }: {
    attemptStartDate: Date;
    attemptEndDate?: Date;
  },
): Promise<OBAnonymizedInfoSchemaType[]> => {
  const dateFilter: FilterQuery<OBAnonymizedInfoSchemaType> = {
    createdAt: {
      $gte: attemptStartDate,
    },
  };

  if (attemptEndDate) {
    dateFilter.createdAt.$lte = attemptEndDate;
  }

  logInfo(
    `[${transactionId}] [SERVICE] getFailedLoginsByDate - requested for dateFilter: ${JSON.stringify(dateFilter)}`,
  );

  const failedLogins: OBAnonymizedInfoSchemaType[] = [];

  const failedLoginsCursor = await OBAnonymizedInfoModel.find(
    {
      infoKey: 'failed_login',
      infoType: 'inquiry',
      ...dateFilter,
    },
    {},
    {
      sort: {
        createdAt: -1,
      },
    },
  );

  for await (const failedLogin of failedLoginsCursor) {
    failedLogins.push(failedLogin.toJSON());
  }

  logInfo(
    `[${transactionId}] [SERVICE] getFailedLoginsByDate - Total failed logins found ${
      failedLogins.length
    } for  dateFilter: ${JSON.stringify(dateFilter)}`,
  );

  return failedLogins;
};

const getReferralSummary = async (transactionId: string, start: Date, end: Date): Promise<any> => {
  logInfo(`[${transactionId}] [SERVICE] getReferralData - Retrieving referral data, ${start}, ${end}`);

  try {
    const aggregationPipeline: PipelineStage[] = [
      {
        $match: {
          infoKey: AnonymizedTypeEnum.FriendReferral,
          updatedAt: { $gte: start, $lte: end },
        },
      },
      {
        $unwind: '$payload.referredByBranchIds',
      },
      {
        $group: {
          _id: '$payload.referredByBranchIds',
          branchId: { $first: '$payload.referredByBranchIds' },
          totalNewReferral: {
            $sum: { $cond: [{ $eq: ['$infoType', 'referral'] }, 1, 0] },
          },
          latestReferral: {
            $first: {
              referredByName: '$payload.referredByName',
              region: '$payload.city',
              jobPosition: '$payload.jobPosition',
              updatedAt: '$updatedAt',
            },
          },
          referralCount: {
            $sum: 1,
          },
        },
      },
      {
        $project: {
          _id: 0,
          branchId: '$_id',
          totalNewReferral: 1,
          latestReferral: 1,
          referralCount: 1,
        },
      },
    ];

    const aggregationResults = await OBAnonymizedInfoModel.aggregate(aggregationPipeline);

    const result = await Promise.all(
      aggregationResults.map(async (data) => {
        const branchDetails = await locationService.getBranchDetailsById(transactionId, data.branchId);

        return {
          branchId: data.branchId,
          totalReferrals: data.totalNewReferral ?? 0,
          branchName: branchDetails?.branchName,
          latestReferral: data.latestReferral ?? null,
        };
      }),
    );

    logInfo(
      `[${transactionId}] [SERVICE] getReferralData - Successfully retrieved referral data, ${JSON.stringify(result)}`,
    );

    return result;
  } catch (error) {
    logError(`[${transactionId}] [SERVICE] getReferralData - FAILED due to error: ${error.message}`);
    throw error;
  }
};

export {
  createOBAnonymizedInfo,
  updateOBAnonymizedInfo,
  getPreviousAnonEntryByIdAndKeyType,
  getReferralsByFilter,
  getConcernsByFilter,
  getFailedLoginsByDate,
  getReferralSummary,
};
