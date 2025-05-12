import { JSONLikeType } from '..';
import { PollsEnum } from '../../enums';

type OBFeatureSummariesUpsertOperationType = {
  summaryId: string;
  metricName: string;
  captureType: string;
  captureIdentifier: string;
  metricStartDate: Date;
  metricEndDate: Date;
  metricPayload: JSONLikeType;
  sampleReference?: JSONLikeType;
};

type OBSubmissionDataType = {
  updatedAt: Date;
  userPsId: string;
  userName: string;
};

type OBLatestPollDataType = {
  title: string;
  pollType: PollsEnum;
  options?: {
    option: string;
    count: number;
  }[];
  numOfStars?: {
    rating: number;
    count: number;
  }[];
  createdAt: Date;
};

type OBLatestReferralDataType = {
  updatedAt: Date;
  referredByName: string;
  region: string;
  jobPosition: string;
};

type OBWellnessNoteDataType = {
  branchId: string;
  wellnessNotes: {
    createdAt: Date;
    cvid: string;
    clientDisplayName: string;
    employeeName: string;
    visitDate: Date;
    branch: string;
    wellnessNote: string;
  };
};

type OBIdBadgeSummaryDataType = {
  branchId: string;
  totalPending: number;
  approvedInRange: number;
  rejectedInRange: number;
  latestSubmission?: OBSubmissionDataType;
};

type OBPollSummaryDataType = {
  branchId: string;
  totalInteractions: number;
  pollType?: PollsEnum;
  latestPoll?: OBLatestPollDataType;
};

type OBBranchDetails = {
  branchName: string;
  totalReferral: number;
};
type OBReferralSummaryDataType = {
  branchId: string;
  totalReferrals: number;
  latestReferral?: OBLatestReferralDataType;
  branchDetails?: OBBranchDetails[];
  branchName?: string;
};

type OBStorySummaryDataType = {
  branchId: string;
  totalPendingRecords: number;
  totalRecords: number;
  latestStory: {
    storyId: string;
    title: string;
    description: string;
    createdAt: Date;
  };
};

type OBMetricUpsertOperationType = {
  idBadgeSummaryData?: OBIdBadgeSummaryDataType;
  pollSummaryData?: OBPollSummaryDataType;
  referralSummaryData?: OBReferralSummaryDataType;
  storySummaryData?: OBStorySummaryDataType;
  wellnessNotesSummaryData?: OBWellnessNoteDataType[]; // Optional to handle null or missing data
};

type OBSummaryDataReturnType =
  | OBIdBadgeSummaryDataType[]
  | OBReferralSummaryDataType[]
  | OBPollSummaryDataType[]
  | OBStorySummaryDataType[]
  | OBWellnessNoteDataType[];

export {
  OBFeatureSummariesUpsertOperationType,
  OBMetricUpsertOperationType,
  OBPollSummaryDataType,
  OBIdBadgeSummaryDataType,
  OBReferralSummaryDataType,
  OBStorySummaryDataType,
  OBWellnessNoteDataType,
  OBSummaryDataReturnType,
};
