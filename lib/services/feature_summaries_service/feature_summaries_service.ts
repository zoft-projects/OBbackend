import { randomUUID } from 'crypto';
import { FilterQuery } from 'mongoose';
import { FeatureEnum } from '../../enums';
import { logInfo, logError, logDebug } from '../../log/util';
import { OBFeatureSummariesModel } from '../../models';
import {
  anonymizedInfoService,
  newsFeedService,
  tempDataService,
  pollService,
  wellnessNoteService,
} from '../../services';
import {
  OBFeatureSummariesUpsertOperationType,
  OBMetricUpsertOperationType,
  OBSummaryDataReturnType,
  OBFeatureSummariesSchemaType,
} from '../../types';
import { startOfDay, endOfDay, isValidDate, mapMetricsSummary } from '../../utils';

const getMetricsSummaryByDates = async (
  transactionId: string,
  captureType: string,
  captureIdentifiers: string[],
  fromDate: Date,
  toDate: Date,
): Promise<OBMetricUpsertOperationType> => {
  try {
    const start = startOfDay(fromDate);
    const end = endOfDay(toDate);

    console.info(
      `[getMetricsSummaryByDates] Fetching latest entry for transactionId: ${transactionId}, $gte: ${start}, $lte: ${end}, captureIdentifiers: ${captureIdentifiers}`,
    );

    const metricNames = [
      FeatureEnum.IdBadge,
      FeatureEnum.Poll,
      FeatureEnum.Referral,
      FeatureEnum.Stories,
      FeatureEnum.WellnessNotes,
    ];

    const summary = await OBFeatureSummariesModel.aggregate([
      {
        $match: {
          metricName: { $in: metricNames },
          captureType,
          captureIdentifier: { $in: [...new Set([...captureIdentifiers, '*'])] },
          metricStartDate: { $gte: start, $lte: end },
        },
      },
      {
        $sort: { metricStartDate: -1 },
      },
      {
        $project: {
          _id: 0,
          metricName: 1,
          metricStartDate: 1,
          metricEndDate: 1,
          metricPayload: 1,
          captureType: 1,
          captureIdentifier: 1,
        },
      },
    ]);

    console.info(`[getMetricsSummaryByDates] Successfully fetched latest entries: ${JSON.stringify(summary)}`);

    return mapMetricsSummary(summary);
  } catch (error) {
    console.error(`[getMetricsSummaryByDates] Error: ${error.message}`);
    throw error;
  }
};

const addSummaryByDay = async (
  transactionId: string,
  featureSummaries: OBFeatureSummariesUpsertOperationType,
): Promise<string> => {
  logInfo(
    `[${transactionId}] [SERVICE] addSummaryByDay - Processing featureSummaries for feature: ${featureSummaries.captureType}, metricName: ${featureSummaries.metricName}`,
  );

  try {
    validateFeatureSummaries(featureSummaries);

    featureSummaries.metricStartDate = startOfDay(featureSummaries.metricStartDate);
    featureSummaries.metricEndDate = endOfDay(featureSummaries.metricEndDate);

    const existingFeatureSummaries = await OBFeatureSummariesModel.findOne({
      metricName: featureSummaries.metricName,
      captureType: featureSummaries.captureType,
      captureIdentifier: featureSummaries.captureIdentifier,
      metricStartDate: featureSummaries.metricStartDate,
      metricEndDate: featureSummaries.metricEndDate,
    });

    if (existingFeatureSummaries) {
      await OBFeatureSummariesModel.updateOne(
        {
          metricName: featureSummaries.metricName,
          captureType: featureSummaries.captureType,
          captureIdentifier: featureSummaries.captureIdentifier,
          metricStartDate: featureSummaries.metricStartDate,
          metricEndDate: featureSummaries.metricEndDate,
        },
        { $set: featureSummaries },
      );

      logInfo(
        `[${transactionId}] [SERVICE] addSummaryByDay - Updated existing summary for feature: ${featureSummaries.captureType}, metricName: ${featureSummaries.metricName}`,
      );

      return existingFeatureSummaries.summaryId;
    } else {
      const newFeatureSummaries = new OBFeatureSummariesModel(featureSummaries);
      const createdFeatureSummaries = await newFeatureSummaries.save();
      logInfo(
        `[${transactionId}] [SERVICE] addSummaryByDay - SUCCESSFUL creation for feature: ${featureSummaries.captureType}, metricName: ${featureSummaries.metricName}`,
      );

      return createdFeatureSummaries.summaryId;
    }
  } catch (error) {
    logError(
      `[${transactionId}] [SERVICE] addSummaryByDay - FAILED for feature: ${featureSummaries.summaryId}, metricName: ${featureSummaries.metricName}, reason: ${error.message}`,
    );
    logDebug(
      `[${transactionId}] [SERVICE] addSummaryByDay - FAILED details, provided: ${JSON.stringify(featureSummaries)}`,
    );

    throw error;
  }
};

const addMetricSummaryByDay = async (transactionId: string, start: Date, end: Date): Promise<void> => {
  logInfo(`[${transactionId}] [SERVICE] addMetricSummaryByDay - Processing feature summaries`);

  try {
    const featureServices = [
      { service: tempDataService.getImageModerationData, featureEnum: FeatureEnum.IdBadge },
      { service: newsFeedService.getStoriesData, featureEnum: FeatureEnum.Stories },
      { service: anonymizedInfoService.getReferralSummary, featureEnum: FeatureEnum.Referral },
      { service: pollService.getPollData, featureEnum: FeatureEnum.Poll },
      { service: wellnessNoteService.getWellnessNotes, featureEnum: FeatureEnum.WellnessNotes },
    ];

    // Fetch and process all metrics
    const metricsResults = await Promise.allSettled(
      featureServices.map(async ({ service, featureEnum }) => {
        const data = await service(transactionId, start, end);
        await processMetricData(transactionId, data, featureEnum, start, end);

        return { featureEnum, data };
      }),
    );

    // Log the status of each operation
    metricsResults.forEach((result, index) => {
      const { featureEnum } = featureServices[index];
      if (result.status === 'fulfilled') {
        logInfo(`[${transactionId}] [SERVICE] addMetricSummaryByDay - SUCCESS for feature: ${featureEnum}`);
      } else {
        logError(
          `[${transactionId}] [SERVICE] addMetricSummaryByDay - FAILED for feature: ${featureEnum}, reason: ${result.reason}`,
        );
      }
    });
  } catch (error) {
    logError(`[${transactionId}] [SERVICE] addMetricSummaryByDay - FAILED reason: ${error.message}`);
    throw error;
  }
};

const processMetricData = async (
  transactionId: string,
  data: OBSummaryDataReturnType,
  metricName: string,
  start: Date,
  end: Date,
) => {
  await Promise.all(
    data.map(async (item: { branchId: string }) => {
      const filter: FilterQuery<OBFeatureSummariesSchemaType> = {
        metricName,
        captureType: 'Branch',
        captureIdentifier: item.branchId,
      };

      if (metricName !== FeatureEnum.WellnessNotes) {
        filter.metricStartDate = start;
        filter.metricEndDate = end;
      }

      const existingFeatureSummaries = await OBFeatureSummariesModel.findOne(filter);

      const featureSummaries = {
        summaryId: randomUUID(),
        metricName,
        captureType: 'Branch',
        captureIdentifier: item.branchId,
        metricStartDate: start,
        metricEndDate: end,
        metricPayload: item,
      };

      if (existingFeatureSummaries) {
        await updateFeatureSummary(transactionId, featureSummaries, metricName, item.branchId, start, end);
      } else {
        await createFeatureSummary(transactionId, featureSummaries);
      }
    }),
  );
};

const updateFeatureSummary = async (
  transactionId: string,
  featureSummaries: any,
  metricName: string,
  branchId: string,
  start: Date,
  end: Date,
) => {
  const filter: FilterQuery<OBFeatureSummariesSchemaType> = {
    metricName,
    captureType: 'Branch',
    captureIdentifier: branchId,
  };

  if (metricName !== FeatureEnum.WellnessNotes) {
    filter.metricStartDate = start;
    filter.metricEndDate = end;
  }
  await OBFeatureSummariesModel.updateOne(filter, { $set: featureSummaries });

  logInfo(
    `[${transactionId}] [SERVICE] addSummaryByDay - Updated existing summary for feature: ${featureSummaries.captureType}, metricName: ${featureSummaries.metricName}`,
  );
};

const deletePollSummary = async (transactionId: string, pollId: string): Promise<void> => {
  if (!pollId) {
    throw new Error('The mandatory field "pollId" is missing or empty.');
  }

  await OBFeatureSummariesModel.deleteMany({
    metricName: FeatureEnum.Poll,
    captureType: 'Branch',
    'metricPayload.latestPoll.pollId': pollId,
  });

  logInfo(`[${transactionId}] [SERVICE] deletePollSummary - Deleted all summaries for pollId: ${pollId}`);
};

const deleteStorySummary = async (transactionId: string, storyId: string): Promise<void> => {
  if (!storyId) {
    throw new Error('The mandatory field "storyId" is missing or empty.');
  }

  await OBFeatureSummariesModel.deleteMany({
    metricName: FeatureEnum.Stories,
    captureType: 'Branch',
    'metricPayload.latestStory.storyId': storyId,
  });

  logInfo(`[${transactionId}] [SERVICE] deleteStorySummary - Deleted all summaries for storyId: ${storyId}`);
};

const createFeatureSummary = async (transactionId: string, featureSummaries: any) => {
  const newFeatureSummaries = new OBFeatureSummariesModel(featureSummaries);
  const createdFeatureSummaries = await newFeatureSummaries.save();

  logInfo(
    `[${transactionId}] [SERVICE] addSummaryByDay - SUCCESSFUL creation for feature: ${featureSummaries.captureType}, metricName: ${featureSummaries.metricName}`,
  );

  return createdFeatureSummaries.summaryId;
};

const validateFeatureSummaries = (featureSummaries: OBFeatureSummariesUpsertOperationType): void => {
  if (!featureSummaries || Object.keys(featureSummaries).length === 0) {
    throw new Error('The mandatory field "featureSummaries" is missing or empty.');
  }

  if (!featureSummaries.metricName || typeof featureSummaries.metricName !== 'string') {
    throw new Error('Feature summary must have a valid metricName.');
  }

  if (!featureSummaries.captureType || typeof featureSummaries.captureType !== 'string') {
    throw new Error('Feature summary must have a valid captureType.');
  }

  if (!featureSummaries.captureIdentifier || typeof featureSummaries.captureIdentifier !== 'string') {
    throw new Error('Feature summary must have a valid captureIdentifier.');
  }

  if (!featureSummaries.metricStartDate || !isValidDate(new Date(featureSummaries.metricStartDate))) {
    throw new Error('Feature summary must have a valid metricStartDate.');
  }

  if (!featureSummaries.metricEndDate || !isValidDate(new Date(featureSummaries.metricEndDate))) {
    throw new Error('Feature summary must have a valid metricEndDate.');
  }
};

export { getMetricsSummaryByDates, addSummaryByDay, addMetricSummaryByDay, deletePollSummary, deleteStorySummary };
