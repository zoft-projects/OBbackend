import {
  AudienceEnum,
  NewsFeedEnum,
  StatusEnum,
  PriorityEnum,
  NewsVisibilityEnum,
  ReactionEnum,
  ProvincialCodesEnum,
} from '../../enums';

type OBUserReactionSchemaType = {
  employeePsId: string;
  displayName?: string;
  reactionType: ReactionEnum;
};

type OBReactionAggregateSchemaType = {
  reactionType: ReactionEnum;
  totalCount: number;
};

type OBImageSchemaType = {
  url: string;
  bucketName: string;
  orientation: string;
  width?: number;
  height?: number;
};

type OBAudioSchemaType = {
  url: string;
  bucketName: string;
};

type OBVideoSchemaType = {
  url: string;
  bucketName?: string;
  sourceType?: string;
};

type OBMultiMediaSchemaType = {
  image?: OBImageSchemaType;
  audio?: OBAudioSchemaType;
  video?: OBVideoSchemaType;
};

type OBCommentsSchemaType = {
  commentId: string;
  employeePsId: string;
  displayName: string;
  message: string;
  isFlagged: boolean;
  isVisible: boolean;
};

type OBNewsConnectedUserSchemaType = {
  employeePsId: string;
  displayName?: string;
  userImageLink?: string;
};

type OBAttributesSchemaType = {
  connectType: string;
  connectedUser?: OBNewsConnectedUserSchemaType;
  description?: string;
};

type OBApprovedBySchemaType = {
  employeePsId: string;
  displayName?: string;
  userImageLink?: string;
};

type OBNewsPostedBySchemaType = {
  employeePsId: string;
  displayName?: string;
  userImageLink?: string;
};

type OBNewsUpdatedBySchemaType = {
  employeePsId: string;
  displayName?: string;
  userImageLink?: string;
};

type OBNewsSchemaType = {
  id?: string;
  newsId: string;
  title: string;
  description: string;
  category: NewsFeedEnum;
  audienceLevel: AudienceEnum;
  branchIds?: string[];
  provincialCodes?: ProvincialCodesEnum[];
  divisionIds?: string[];
  sampleUserReactions?: OBUserReactionSchemaType[];
  totalReactionAggregate: OBReactionAggregateSchemaType[];
  visibility: NewsVisibilityEnum;
  multimedia?: OBMultiMediaSchemaType;
  comments?: OBCommentsSchemaType[];
  attributes?: OBAttributesSchemaType;
  status: StatusEnum;
  approvedBy?: OBApprovedBySchemaType;
  postedBy: OBNewsPostedBySchemaType;
  priority: PriorityEnum;
  expiresAt?: Date;
  isDeleted: boolean;
  updatedBy?: OBNewsUpdatedBySchemaType;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
};

type OBNewsInteractionSchemaType = {
  id?: string;
  newsId: string;
  title?: string;
  category: NewsFeedEnum;
  reactedUserPsId: string;
  userDisplayName?: string;
  userImageLink?: string;
  reactionType: ReactionEnum;
  reactedAt: Date;
};

export {
  NewsVisibilityEnum,
  OBUserReactionSchemaType,
  OBReactionAggregateSchemaType,
  OBImageSchemaType,
  OBVideoSchemaType,
  OBAudioSchemaType,
  OBMultiMediaSchemaType,
  OBCommentsSchemaType,
  OBNewsConnectedUserSchemaType,
  OBAttributesSchemaType,
  OBApprovedBySchemaType,
  OBNewsPostedBySchemaType,
  OBNewsUpdatedBySchemaType,
  OBNewsSchemaType,
  OBNewsInteractionSchemaType,
};
