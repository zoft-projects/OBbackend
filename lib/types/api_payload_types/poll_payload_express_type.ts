import { AudienceEnum, OBPollStatusEnum, PollInteractionStatusEnum, PollsEnum, PriorityEnum } from '../../enums';

type PollPayloadType = {
  pollId: string;
  pollTitle: string;
  pollType: PollsEnum;
  pollPriority: PriorityEnum;
  pollTag: AudienceEnum;
  pollOptions: string[];
  legacyCmsId?: string;
  pollCreatedDate: Date;
  pollStatus: OBPollStatusEnum;
  pollCreatedBy: {
    employeePsId: string;
    displayName?: string;
    userImageLink?: string;
  };
  isDisabled: boolean;
  interactionStatus?: PollInteractionStatusEnum;
};

type PollInteractionPayloadType = {
  pollId: string;
  pollType: PollsEnum;
  selectionOptions?: string[];
  feedbackComment?: string;
  numOfStars?: number;
  interactedDate: Date;
  interactedUser: {
    employeePsId: string;
    displayName?: string;
    userImageLink?: string;
  };
};

type PollInteractionsSummaryPayloadType = {
  pollId: string;
  pollTitle: string;
  pollType: PollsEnum;
  pollPriority: PriorityEnum;
  totalInteractions: number;
  pollOptions: { option: string; votes: number }[];
};

export { PollPayloadType, PollInteractionPayloadType, PollInteractionsSummaryPayloadType };
