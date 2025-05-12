import {
  AudienceEnum,
  OBPollStatusEnum,
  PollsEnum,
  PriorityEnum,
  ProvincialCodesEnum,
  UserLevelEnum,
} from '../../enums';

type HttpPOSTCreateOBPoll = {
  pollId?: string;
  title: string;
  pollType: PollsEnum;
  isDeleted?: boolean;
  audienceLevel: AudienceEnum;
  branchIds?: string[];
  divisionIds?: string[];
  provincialCodes?: ProvincialCodesEnum[];
  jobLevels: number[];
  accessLevelNames?: UserLevelEnum[];
  legacyCmsId?: string;
  pollOptions?: string[];
  status?: OBPollStatusEnum;
  priority?: PriorityEnum;
  validFrom?: string;
  expiresInDays?: number;
  createdByUserId?: string; // TODO remove after migration
  createdByUserName?: string; // TODO remove after migration
  createdAt?: string;
  updatedAt?: string;
};

type HttpPOSTCreateOBPollInteraction = {
  pollId: string;
  pollType: PollsEnum;
  selectionOptions?: string[];
  feedbackComment?: string;
  numOfStars?: number;
  createdUserId?: string; // TODO : Remove after migration
  createdUserName?: string; // TODO : Remove after migration
};

export { HttpPOSTCreateOBPoll, HttpPOSTCreateOBPollInteraction };
