import { FeatureEnum } from '../../enums';
import {
  MetricsPayloadType,
  OBIdBadgeSummaryDataType,
  OBMetricUpsertOperationType,
  OBPollSummaryDataType,
  OBReferralSummaryDataType,
  OBStorySummaryDataType,
  OBSummaryDataReturnType,
  OBWellnessNoteDataType,
} from '../../types';

const mapMetricsToApiPayload = (metricData: OBMetricUpsertOperationType): MetricsPayloadType => {
  const mappedMetrics: MetricsPayloadType = {
    idBadgeSummary: metricData.idBadgeSummaryData
      ? {
          totalPending: metricData.idBadgeSummaryData.totalPending,
          totalApproved: metricData.idBadgeSummaryData.approvedInRange || 0,
          totalRejected: metricData.idBadgeSummaryData.rejectedInRange || 0,
          latestSubmission: metricData.idBadgeSummaryData.latestSubmission
            ? {
                updatedAt: metricData.idBadgeSummaryData.latestSubmission.updatedAt,
                userPsId: metricData.idBadgeSummaryData.latestSubmission.userPsId,
                employeeName: metricData.idBadgeSummaryData.latestSubmission.userName,
              }
            : null,
        }
      : null,

    referralSummary: metricData.referralSummaryData
      ? {
          totalNewReferrals: metricData.referralSummaryData.totalReferrals || 0,
          latestReferral: metricData.referralSummaryData.latestReferral
            ? {
                jobPosition: metricData.referralSummaryData.latestReferral.jobPosition,
                region: metricData.referralSummaryData.latestReferral.region,
                referredByName: metricData.referralSummaryData.latestReferral.referredByName,
              }
            : null,
          branchDetails: metricData.referralSummaryData.branchDetails || null,
        }
      : null,

    pollSummary: metricData.pollSummaryData
      ? {
          latestPollTitle: metricData.pollSummaryData.latestPoll?.title,
          totalInteractions: metricData.pollSummaryData.totalInteractions || 0,
          pollResults: metricData.pollSummaryData.latestPoll
            ? {
                title: metricData.pollSummaryData.latestPoll.title,
                updatedAt: metricData.pollSummaryData.latestPoll.createdAt,
              }
            : null,
          selectionOptions: metricData.pollSummaryData.latestPoll.options
            ? metricData.pollSummaryData.latestPoll.options.map(({ option, count }) => {
                return { option, count };
              })
            : null,
          numOfStars: metricData.pollSummaryData.latestPoll.numOfStars
            ? metricData.pollSummaryData.latestPoll.numOfStars
            : null,
        }
      : null,

    storySummary: metricData.storySummaryData
      ? {
          totalPending: metricData.storySummaryData.totalPendingRecords || 0,
          totalRecords: metricData.storySummaryData.totalRecords || 0,
          latestStory: metricData.storySummaryData.latestStory || null,
        }
      : null,

    latestWellnessNoteSummary: metricData.wellnessNotesSummaryData
      ? metricData.wellnessNotesSummaryData
          .map((notes) => notes.wellnessNotes)
          .flat()
          .sort((date1, date2) => new Date(date2.createdAt).getTime() - new Date(date1.createdAt).getTime())
          .slice(0, 5)
      : null,
  };

  return mappedMetrics;
};

const mapMetricsSummary = (summary: OBSummaryDataReturnType): OBMetricUpsertOperationType => {
  const response: OBMetricUpsertOperationType = {};
  const idBadgeLatestMap: Record<string, { updatedAt: Date; metricPayload: OBIdBadgeSummaryDataType }> = {};

  const metricMapping = {
    [FeatureEnum.Stories]: (metric: { metricPayload: OBStorySummaryDataType }) => {
      if (!response.storySummaryData) {
        response.storySummaryData = { totalPendingRecords: 0, totalRecords: 0, latestStory: null, branchId: null };
      }

      response.storySummaryData.totalPendingRecords += metric.metricPayload.totalPendingRecords || 0;
      response.storySummaryData.totalRecords += metric.metricPayload.totalRecords || 0;

      const currentStory = metric.metricPayload.latestStory;
      if (
        currentStory &&
        (!response.storySummaryData.latestStory ||
          new Date(currentStory.createdAt) > new Date(response.storySummaryData.latestStory.createdAt))
      ) {
        response.storySummaryData.latestStory = currentStory;
      }
    },
    [FeatureEnum.IdBadge]: (metric: { captureIdentifier?: string; metricPayload: OBIdBadgeSummaryDataType }) => {
      if (!response.idBadgeSummaryData) {
        response.idBadgeSummaryData = {
          totalPending: 0,
          approvedInRange: 0,
          rejectedInRange: 0,
          latestSubmission: null,
          branchId: null,
        };
      }
      response.idBadgeSummaryData.approvedInRange += metric.metricPayload.approvedInRange || 0;
      response.idBadgeSummaryData.rejectedInRange += metric.metricPayload.rejectedInRange || 0;
      const currentSubmission = metric.metricPayload.latestSubmission;
      const currentUpdatedAt = currentSubmission?.updatedAt;
      if (
        currentUpdatedAt &&
        (!response.idBadgeSummaryData.latestSubmission ||
          new Date(currentUpdatedAt) > new Date(response.idBadgeSummaryData.latestSubmission.updatedAt))
      ) {
        response.idBadgeSummaryData.latestSubmission = currentSubmission;
      }
      response.idBadgeSummaryData.branchId = metric.metricPayload.branchId || response.idBadgeSummaryData.branchId;
      const captureId = metric.captureIdentifier;
      if (!idBadgeLatestMap[captureId]) {
        idBadgeLatestMap[captureId] = {
          updatedAt: currentUpdatedAt ? new Date(currentUpdatedAt) : null,
          metricPayload: metric.metricPayload,
        };
      } else {
        const existingUpdatedAt = idBadgeLatestMap[captureId].updatedAt;
        if (currentUpdatedAt && existingUpdatedAt && new Date(currentUpdatedAt) > existingUpdatedAt) {
          idBadgeLatestMap[captureId] = {
            updatedAt: new Date(currentUpdatedAt),
            metricPayload: metric.metricPayload,
          };
        }
      }
    },
    [FeatureEnum.Poll]: (metric: { metricPayload: OBPollSummaryDataType }) => {
      if (!response.pollSummaryData) {
        response.pollSummaryData = { totalInteractions: 0, latestPoll: null, branchId: null };
      }

      const latestPoll = metric.metricPayload.latestPoll;
      if (
        latestPoll &&
        (!response.pollSummaryData.latestPoll ||
          new Date(latestPoll.createdAt) > new Date(response.pollSummaryData.latestPoll.createdAt))
      ) {
        response.pollSummaryData.latestPoll = latestPoll;
        response.pollSummaryData.totalInteractions = metric.metricPayload.totalInteractions || 0;
        response.pollSummaryData.branchId = metric.metricPayload.branchId || null;
      }
    },
    [FeatureEnum.Referral]: (metric: { metricPayload: OBReferralSummaryDataType }) => {
      console.log('metric.metricPayload', metric.metricPayload);
      if (!response.referralSummaryData) {
        response.referralSummaryData = {
          totalReferrals: 0,
          latestReferral: null,
          branchId: null,
          branchDetails: [],
        };
      }

      response.referralSummaryData.totalReferrals += metric.metricPayload.totalReferrals || 0;
      response.referralSummaryData.branchDetails.push({
        branchName: metric.metricPayload.branchName,
        totalReferral: metric.metricPayload.totalReferrals,
      });
      response.referralSummaryData.branchDetails = getUniqueBranchReferrals(response.referralSummaryData.branchDetails);

      const latestReferral = metric.metricPayload.latestReferral;
      if (
        latestReferral &&
        (!response.referralSummaryData.latestReferral ||
          new Date(latestReferral.updatedAt) > new Date(response.referralSummaryData.latestReferral.updatedAt))
      ) {
        response.referralSummaryData.latestReferral = latestReferral;
      }
    },
    [FeatureEnum.WellnessNotes]: (metric: { metricPayload: OBWellnessNoteDataType }) => {
      if (!response.wellnessNotesSummaryData) {
        response.wellnessNotesSummaryData = [];
      }

      response.wellnessNotesSummaryData.push(metric.metricPayload);
    },
  };

  summary.forEach((metric) => {
    const updateResponse = metricMapping[metric.metricName];
    if (updateResponse) {
      updateResponse(metric);
    }
  });

  if (response.idBadgeSummaryData) {
    let totalPendingSum = 0;
    Object.values(idBadgeLatestMap).forEach(({ metricPayload }) => {
      totalPendingSum += metricPayload.totalPending || 0;
    });
    response.idBadgeSummaryData.totalPending = totalPendingSum;
  }

  return response;
};

function getUniqueBranchReferrals(data: { branchName: string; totalReferral: number }[]) {
  const branchReferralsMap = {};

  data.forEach((entry) => {
    const branch = entry.branchName;
    if (branch && branch !== 'undefined') {
      if (branchReferralsMap[branch]) {
        branchReferralsMap[branch] += entry.totalReferral;
      } else {
        branchReferralsMap[branch] = entry.totalReferral;
      }
    }
  });

  const uniquebranchReferrals = Object.keys(branchReferralsMap).map((branch) => ({
    branchName: branch,
    totalReferral: branchReferralsMap[branch],
  }));

  uniquebranchReferrals.sort((first, second) => second.totalReferral - first.totalReferral);

  return uniquebranchReferrals;
}

export { mapMetricsToApiPayload, mapMetricsSummary };
