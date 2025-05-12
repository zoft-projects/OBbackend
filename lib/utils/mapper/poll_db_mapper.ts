import { addDays } from 'date-fns';
import { mapAccessLevelToName } from './user_level_mapper';
import {
  AudienceEnum,
  OBPollStatusEnum,
  PollsEnum,
  PriorityEnum,
  ProvincialCodesEnum,
  UserLevelEnum,
} from '../../enums';
import {
  HttpPOSTCreateOBPoll,
  OBPollInteractionSchemaType,
  OBPollInteractionUpsertOperationType,
  OBPollUpsertOperationType,
  OBPollsSchemaType,
  PollInteractionPayloadType,
  OBPollInteractionsSummaryType,
  PollInteractionsSummaryPayloadType,
  PollPayloadType,
} from '../../types';

const mapPollRequestToDBRecord = (poll: Partial<OBPollUpsertOperationType>): OBPollsSchemaType => {
  const mappedPoll: Partial<OBPollsSchemaType> = {
    pollId: poll.pollId,
    title: poll.title,
  };

  if (poll.pollType in PollsEnum) {
    mappedPoll.pollType = poll.pollType;
  }

  if (poll.legacyCmsId) {
    mappedPoll.legacyCmsId = poll.legacyCmsId;
  }

  if (Array.isArray(poll.accessLevelNames) && poll.accessLevelNames.length > 0) {
    const validAccessLevelNames: UserLevelEnum[] = poll.accessLevelNames.filter((level) => level in UserLevelEnum);
    mappedPoll.accessLevelNames = validAccessLevelNames;
  }

  if (poll.audienceLevel in AudienceEnum) {
    mappedPoll.audienceLevel = poll.audienceLevel as AudienceEnum;
  }

  if (Array.isArray(poll.branchIds) && poll.branchIds.length > 0) {
    mappedPoll.branchIds = poll.branchIds;
  }

  if (Array.isArray(poll.provincialCodes) && poll.provincialCodes.length > 0) {
    const validProvincialCodes: ProvincialCodesEnum[] = poll.provincialCodes.filter(
      (code) => code in ProvincialCodesEnum,
    );
    mappedPoll.provincialCodes = validProvincialCodes;
  }

  if (Array.isArray(poll.divisionIds) && poll.divisionIds.length > 0) {
    mappedPoll.divisionIds = poll.divisionIds;
  }

  if (poll.status in OBPollStatusEnum) {
    mappedPoll.status = poll.status as OBPollStatusEnum;
  } else {
    mappedPoll.status = OBPollStatusEnum.Enabled; // default status
  }

  if (Array.isArray(poll.pollOptions) && poll.pollOptions.length > 0) {
    mappedPoll.pollOptions = poll.pollOptions;
  }

  if (poll.validFrom) {
    mappedPoll.validFrom = new Date(poll.validFrom);
  }

  if (poll.expiresAt) {
    mappedPoll.expiresAt = new Date(poll.expiresAt);
  }

  if (poll.createdBy) {
    mappedPoll.createdBy = {
      employeePsId: poll.createdBy.employeePsId,
      displayName: poll.createdBy.displayName,
      userImageLink: poll.createdBy.userImageLink,
    };
  }

  if (poll.priority && poll.priority in PriorityEnum) {
    mappedPoll.priority = poll.priority;
  } else {
    mappedPoll.priority = PriorityEnum.Medium;
  }

  if (typeof poll.isDeleted === 'boolean') {
    mappedPoll.isDeleted = poll.isDeleted;
  }

  if (poll.createdAt) {
    mappedPoll.createdAt = new Date(poll.createdAt);
  }

  if (poll.updatedAt) {
    mappedPoll.updatedAt = new Date(poll.updatedAt);
  }

  return mappedPoll as OBPollsSchemaType;
};

const mapPollInteractionToDBRecord = (
  pollInteraction: OBPollInteractionUpsertOperationType,
): OBPollInteractionSchemaType => {
  const mappedPollInteraction: Partial<OBPollInteractionSchemaType> = {
    pollId: pollInteraction.pollId,
    pollType: pollInteraction.pollType,
  };

  if (pollInteraction.createdAt) {
    mappedPollInteraction.createdAt = new Date(pollInteraction.createdAt);
  }

  if (pollInteraction.updatedAt) {
    mappedPollInteraction.updatedAt = new Date(pollInteraction.updatedAt);
  }

  if (pollInteraction.feedbackComment) {
    mappedPollInteraction.feedbackComment = pollInteraction.feedbackComment;
  }

  if (pollInteraction.selectionOptions) {
    mappedPollInteraction.selectionOptions = pollInteraction.selectionOptions;
  }

  if (pollInteraction.numOfStars) {
    mappedPollInteraction.numOfStars = pollInteraction.numOfStars;
  }
  if (pollInteraction.interactedUserPsId) {
    mappedPollInteraction.interactedUser = {
      employeePsId: pollInteraction.interactedUserPsId,
      displayName: pollInteraction.displayName,
    };
  }

  if (pollInteraction.interactedAt) {
    mappedPollInteraction.interactedAt = pollInteraction.interactedAt;
  }

  return mappedPollInteraction as OBPollInteractionSchemaType;
};

const mapPollApiRequestToServiceRequest = (requestData: HttpPOSTCreateOBPoll): OBPollUpsertOperationType => {
  const {
    title,
    pollType,
    isDeleted,
    audienceLevel,
    branchIds,
    divisionIds,
    provincialCodes,
    jobLevels,
    accessLevelNames,
    status,
    pollOptions,
    priority,
    validFrom,
    expiresInDays,
    createdByUserId,
    createdByUserName,
    createdAt,
    updatedAt,
    legacyCmsId,
  } = requestData;

  const mappedPoll: Partial<OBPollUpsertOperationType> = {};

  if (requestData.pollId) {
    mappedPoll.pollId = requestData.pollId;
  }

  if (title) {
    mappedPoll.title = title;
  }

  if (pollType in PollsEnum) {
    mappedPoll.pollType = pollType;
  }

  if (typeof isDeleted === 'boolean') {
    mappedPoll.isDeleted = isDeleted;
  }

  if (audienceLevel in AudienceEnum) {
    mappedPoll.audienceLevel = audienceLevel;
  }

  if (legacyCmsId) {
    mappedPoll.legacyCmsId = legacyCmsId;
  }

  if (Array.isArray(branchIds) && branchIds.length > 0) {
    mappedPoll.branchIds = branchIds;
  }

  if (branchIds?.length === 0 && audienceLevel === AudienceEnum.National) {
    mappedPoll.branchIds = ['*'];
  }

  if (Array.isArray(divisionIds) && divisionIds.length > 0) {
    mappedPoll.divisionIds = divisionIds;
  }

  if (Array.isArray(provincialCodes) && provincialCodes.length > 0) {
    const validProvincialCodes: ProvincialCodesEnum[] = provincialCodes.filter((code) => code in ProvincialCodesEnum);
    mappedPoll.provincialCodes = validProvincialCodes;
  }

  if (Array.isArray(jobLevels) && jobLevels.length > 0) {
    mappedPoll.accessLevelNames = [...new Set(jobLevels.map((jobLevel) => mapAccessLevelToName(jobLevel)))];
  }

  if (Array.isArray(accessLevelNames) && provincialCodes.length > 0) {
    const validAccessLevelNames: UserLevelEnum[] = accessLevelNames.filter((level) => level in UserLevelEnum);
    mappedPoll.accessLevelNames = validAccessLevelNames;
  }

  if (status) {
    mappedPoll.status = status;
  }

  if (priority in PriorityEnum) {
    mappedPoll.priority = priority;
  }

  if (Array.isArray(pollOptions) && pollOptions.length > 0) {
    mappedPoll.pollOptions = pollOptions;
  }

  if (validFrom) {
    mappedPoll.validFrom = new Date(validFrom);
  }

  if (expiresInDays) {
    const date = new Date();
    mappedPoll.expiresAt = addDays(new Date(), expiresInDays);
    mappedPoll.expiresAt = date;
  }

  if (createdAt) {
    mappedPoll.createdAt = new Date(createdAt);
  }

  if (updatedAt) {
    mappedPoll.updatedAt = new Date(updatedAt);
  }

  if (createdByUserId) {
    mappedPoll.createdBy = {
      employeePsId: createdByUserId,
      displayName: createdByUserName,
    };
  }

  return mappedPoll as OBPollUpsertOperationType;
};

const mapDBPollToApiPayload = (obPoll: OBPollsSchemaType): Partial<PollPayloadType> => {
  const mappedPoll: Partial<PollPayloadType> = {
    pollId: obPoll.pollId,
    pollTitle: obPoll.title,
  };

  if (obPoll.legacyCmsId) {
    mappedPoll.legacyCmsId = obPoll.legacyCmsId;
  }

  if (obPoll.pollType in PollsEnum) {
    mappedPoll.pollType = obPoll.pollType;
  }

  if (obPoll.audienceLevel in AudienceEnum) {
    mappedPoll.pollTag = obPoll.audienceLevel as AudienceEnum;
  }

  if (obPoll.status && obPoll.status in OBPollStatusEnum) {
    mappedPoll.pollStatus = obPoll.status;
  }

  if (obPoll.priority && obPoll.priority in PriorityEnum) {
    mappedPoll.pollPriority = obPoll.priority;
  }

  if (Array.isArray(obPoll.pollOptions) && obPoll.pollOptions.length > 0) {
    mappedPoll.pollOptions = obPoll.pollOptions;
  }

  if (obPoll.createdBy) {
    mappedPoll.pollCreatedBy = {
      employeePsId: obPoll.createdBy.employeePsId,
      displayName: obPoll.createdBy.displayName,
      userImageLink: obPoll.createdBy.userImageLink,
    };
  }

  if (obPoll.createdAt) {
    mappedPoll.pollCreatedDate = new Date(obPoll.createdAt);
  }

  if (typeof obPoll.isDeleted === 'boolean') {
    mappedPoll.isDisabled = obPoll.isDeleted;
  }

  return mappedPoll as PollPayloadType;
};

const mapDBPollInteractionsToApiPayload = (
  obPollInteraction: OBPollInteractionSchemaType,
): PollInteractionPayloadType => {
  const mappedInteraction: Partial<PollInteractionPayloadType> = {
    pollId: obPollInteraction.pollId,
    pollType: obPollInteraction.pollType,
  };

  if (obPollInteraction.selectionOptions.length) {
    mappedInteraction.selectionOptions = obPollInteraction.selectionOptions;
  }

  if (obPollInteraction.feedbackComment) {
    mappedInteraction.feedbackComment = obPollInteraction.feedbackComment;
  }

  if (obPollInteraction.numOfStars) {
    mappedInteraction.numOfStars = obPollInteraction.numOfStars;
  }

  if (obPollInteraction.interactedUser) {
    mappedInteraction.interactedUser = {
      employeePsId: obPollInteraction.interactedUser.employeePsId,
      displayName: obPollInteraction.interactedUser.displayName,
      userImageLink: obPollInteraction.interactedUser.userImageLink,
    };
  }

  if (obPollInteraction.interactedAt) {
    mappedInteraction.interactedDate = new Date(obPollInteraction.interactedAt);
  }

  return mappedInteraction as PollInteractionPayloadType;
};

const mapDBPollInteractionsSummaryToApiPayload = (
  obPollInteraction: Partial<OBPollInteractionsSummaryType & OBPollsSchemaType>,
): PollInteractionsSummaryPayloadType => {
  const mappedInteraction: PollInteractionsSummaryPayloadType = {
    pollId: obPollInteraction.pollId,
    pollTitle: obPollInteraction.title,
    pollPriority: obPollInteraction.priority,
    pollType: obPollInteraction.pollType,
    totalInteractions: obPollInteraction.totalInteractions || 0,
    pollOptions: [],
  };

  if (obPollInteraction?.options) {
    mappedInteraction.pollOptions = obPollInteraction.pollOptions.map((option: string) => {
      const optionObject = obPollInteraction.options.find((opt) => opt.option === option);

      return optionObject || { option, votes: 0 };
    });
  }

  return mappedInteraction as PollInteractionsSummaryPayloadType;
};

export {
  mapPollRequestToDBRecord,
  mapPollApiRequestToServiceRequest,
  mapDBPollToApiPayload,
  mapPollInteractionToDBRecord,
  mapDBPollInteractionsToApiPayload,
  mapDBPollInteractionsSummaryToApiPayload,
};
