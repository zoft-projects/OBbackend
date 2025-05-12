import {
  AudienceEnum,
  PriorityEnum,
  UserLevelEnum,
  PollsEnum,
  ProvincialCodesEnum,
  OBPollStatusEnum,
} from '../../enums';

type OBPollUserSchemaType = {
  employeePsId: string;
  displayName?: string;
  userImageLink?: string;
};

type OBPollsSchemaType = {
  id?: string;
  pollId: string;
  title: string;
  pollType: PollsEnum;
  audienceLevel: AudienceEnum;
  branchIds?: string[];
  provincialCodes?: ProvincialCodesEnum[];
  divisionIds?: string[];
  accessLevelNames: UserLevelEnum[];
  pollOptions?: string[];
  legacyCmsId?: string;
  status: OBPollStatusEnum;
  priority: PriorityEnum;
  validFrom: Date;
  expiresAt?: Date;
  isDeleted: boolean;
  createdBy: OBPollUserSchemaType;
  updatedBy?: OBPollUserSchemaType;
  createdAt: Date;
  updatedAt: Date;
};

type OBPollInteractionSchemaType = {
  id?: string;
  pollId: string;
  pollType: PollsEnum;
  selectionOptions?: string[];
  feedbackComment?: string;
  numOfStars?: number;
  interactedAt: Date;
  interactedUser: OBPollUserSchemaType;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type OBPollInteractionsSummaryType = {
  pollId: string;
  totalInteractions: number;
  options: { option: string; votes: number }[];
};

export { OBPollsSchemaType, OBPollUserSchemaType, OBPollInteractionSchemaType, OBPollInteractionsSummaryType };
