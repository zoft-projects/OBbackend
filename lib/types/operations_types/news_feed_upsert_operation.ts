import { OBNewsSchemaType } from '..';
import {
  AudienceEnum,
  FileTransportEnum,
  NewsFeedEnum,
  PriorityEnum,
  ProvincialCodesEnum,
  ReactionEnum,
  ReactionUndoEnum,
  StatusEnum,
} from '../../enums';

type ObNewsFileBufferTypeData = {
  fieldName?: string;
  originalName?: string;
  encoding?: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
};

type OBNewsFeedMultiMediaType = {
  type?: FileTransportEnum.Link | FileTransportEnum.Buffer;
  image?: {
    url?: string;
    buffer?: ObNewsFileBufferTypeData;
    bucketName?: string;
    orientation?: string;
    height?: number;
    width?: number;
  };
  audio?: {
    url?: string;
    buffer?: ObNewsFileBufferTypeData;
    bucketName?: string;
  };
  video?: {
    url?: string;
    buffer?: ObNewsFileBufferTypeData;
    bucketName?: string;
    sourceType?: string;
  };
};

type OBNewsFeedUpsertOperationType = {
  newsId: string;
  title: string;
  description: string;
  category: NewsFeedEnum;
  audienceLevel: AudienceEnum;
  branchIds?: string[];
  provincialCodes?: ProvincialCodesEnum[];
  divisionIds?: string[];
  visibility: string;
  multimedia?: OBNewsFeedMultiMediaType;
  connectType: string;
  connectDescription?: string;
  connectedUser?: {
    employeePsId: string;
    displayName?: string;
    userImageLink?: string;
  };
  status: StatusEnum;
  approvedBy?: {
    employeePsId: string;
    displayName?: string;
    userImageLink?: string;
  };
  postedBy: {
    employeePsId: string;
    displayName?: string;
    userImageLink?: string;
  };
  updatedBy?: {
    employeePsId: string;
    displayName?: string;
    userImageLink?: string;
  };
  priority?: PriorityEnum;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date;
  isDeleted: boolean;
  currentUser: {
    jobLevel: number;
    branchIds: string[];
  };
};

type NormalizedNewsFeedType = {
  news: OBNewsSchemaType;
  additionalDetails: {
    signedImageUrl: string;
    signedAudioUrl: string;
    currentUserReaction: {
      isReacted: boolean;
      reactionType: ReactionEnum;
    };
  };
};

type OBNewsInteractedOperationType = {
  newsId: string;
  title?: string;
  category?: string;
  reactionType: ReactionEnum | ReactionUndoEnum;
  reactedUserPsId: string;
  userDisplayName?: string;
  userImageLink?: string;
};

export {
  OBNewsFeedUpsertOperationType,
  ObNewsFileBufferTypeData,
  OBNewsFeedMultiMediaType,
  OBNewsInteractedOperationType,
  NormalizedNewsFeedType,
};
