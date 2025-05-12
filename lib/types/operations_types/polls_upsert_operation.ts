import { AudienceEnum, PollsEnum, PriorityEnum, ProvincialCodesEnum, UserLevelEnum } from '../../enums';

type OBPollUpsertOperationType = {
  pollId?: string;
  title: string;
  pollType: PollsEnum;
  isDeleted?: boolean;
  audienceLevel: AudienceEnum;
  branchIds?: string[];
  provincialCodes?: ProvincialCodesEnum[];
  divisionIds?: string[];
  accessLevelNames: UserLevelEnum[];
  pollOptions?: string[];
  status?: string;
  legacyCmsId?: string;
  priority: PriorityEnum;
  validFrom: Date;
  expiresAt?: Date;
  createdBy: {
    employeePsId: string;
    displayName?: string;
    userImageLink?: string;
  };
  createdAt?: Date;
  updatedBy?: {
    employeePsId: string;
    displayName?: string;
    userImageLink?: string;
  };
  updatedAt?: Date;
};

type OBPollInteractionUpsertOperationType = {
  pollId: string;
  pollType: PollsEnum;
  selectionOptions?: string[];
  feedbackComment?: string;
  numOfStars?: number;
  interactedUserPsId: string;
  displayName?: string;
  createdAt?: Date;
  interactedAt?: Date;
  updatedAt?: Date;
};

export { OBPollUpsertOperationType, OBPollInteractionUpsertOperationType };
