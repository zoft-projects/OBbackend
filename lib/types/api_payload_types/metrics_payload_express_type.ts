type IdBadgeSummaryType = {
  totalPending: number;
  totalApproved: number;
  totalRejected: number;
  latestSubmission?: {
    employeeName: string;
    userPsId: string;
    updatedAt: Date;
  };
};

type ReferralSummaryType = {
  totalNewReferrals: number;
  latestReferral?: {
    referredByName: string;
    region: string;
    jobPosition: string;
  };
  branchDetails: { totalReferral: number; branchName: string }[];
};

type PollSummaryType = {
  latestPollTitle?: string;
  totalInteractions: number;
  pollResults?: {
    title: string;
    updatedAt: Date;
  };
  selectionOptions?: {
    option: string;
    count: number;
  }[];
  numOfStars?: {
    rating: number;
    count: number;
  }[];
};

type StorySummaryType = {
  totalPending: number;
  totalRecords: number;
  latestStory?: {
    storyId: string;
    title: string;
    description: string;
  };
};

type WellnessNoteType = {
  cvid: string;
  clientDisplayName: string;
  employeeName: string;
  visitDate: Date;
  branch: string;
  wellnessNote: string;
};

type MetricsPayloadType = {
  idBadgeSummary?: IdBadgeSummaryType;
  referralSummary?: ReferralSummaryType;
  pollSummary?: PollSummaryType;
  storySummary?: StorySummaryType;
  latestWellnessNoteSummary?: WellnessNoteType[];
};

export { MetricsPayloadType };
