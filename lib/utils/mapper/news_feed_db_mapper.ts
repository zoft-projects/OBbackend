import config from 'config';
import {
  AudienceEnum,
  NewsFeedEnum,
  StatusEnum,
  PriorityEnum,
  ReactionEnum,
  FileTransportEnum,
  MultiMediaEnum,
  ProvincialCodesEnum,
  ReactionUndoEnum,
} from '../../enums';
import {
  HttpPOSTCreateOBNewsFeed,
  OBNewsFeedUpsertOperationType,
  OBNewsSchemaType,
  NewsVisibilityEnum,
  OBNewsInteractionSchemaType,
  OBNewsInteractedOperationType,
  HttpPOSTNewsInteraction,
  ObNewsFileBufferTypeData,
  NormalizedNewsFeedType,
  NewsFeedPayloadType,
} from '../../types';
import { addDays } from '../../utils';

const bucketNameS3: string = config.get('Services.s3.bucketName');

const mapNewsFeedRequestToDBRecord = (newsFeed: Partial<OBNewsFeedUpsertOperationType>): Partial<OBNewsSchemaType> => {
  const mappedNewsFeed: Partial<OBNewsSchemaType> = {
    newsId: newsFeed.newsId,
  };

  if (newsFeed.title) {
    mappedNewsFeed.title = newsFeed.title;
  }

  if (newsFeed.description) {
    mappedNewsFeed.description = newsFeed.description;
  }

  if (newsFeed.category) {
    if (newsFeed.category === NewsFeedEnum.News) {
      mappedNewsFeed.category = NewsFeedEnum.News;
    } else if (newsFeed.category === NewsFeedEnum.Recognition) {
      mappedNewsFeed.category = NewsFeedEnum.Recognition;
    } else {
      mappedNewsFeed.category = NewsFeedEnum.Story;
    }
  }

  if (newsFeed.audienceLevel && newsFeed.audienceLevel in AudienceEnum) {
    mappedNewsFeed.audienceLevel = newsFeed.audienceLevel as AudienceEnum;
  }

  if (Array.isArray(newsFeed.branchIds) && newsFeed.branchIds.length > 0) {
    mappedNewsFeed.branchIds = newsFeed.branchIds;
  }

  if (Array.isArray(newsFeed.provincialCodes) && newsFeed.provincialCodes.length > 0) {
    const validProvincialCodes: ProvincialCodesEnum[] = [];

    newsFeed.provincialCodes.forEach((provincialCode) => {
      if (provincialCode in ProvincialCodesEnum) {
        validProvincialCodes.push(provincialCode as ProvincialCodesEnum);
      }
    });
    mappedNewsFeed.provincialCodes = validProvincialCodes;
  }

  if (Array.isArray(newsFeed.divisionIds) && newsFeed.divisionIds.length > 0) {
    mappedNewsFeed.divisionIds = newsFeed.divisionIds;
  }

  if (newsFeed.visibility && newsFeed.visibility in NewsVisibilityEnum) {
    mappedNewsFeed.visibility = newsFeed.visibility as NewsVisibilityEnum;
  } else {
    mappedNewsFeed.visibility = NewsVisibilityEnum.All;
  }

  if (newsFeed.multimedia?.image) {
    const imageProperties = newsFeed.multimedia.image;
    mappedNewsFeed.multimedia = {
      image: {
        url: imageProperties.url,
        bucketName: imageProperties.bucketName,
        height: imageProperties.height,
        width: imageProperties.width,
        orientation: imageProperties.orientation,
      },
    };
  }

  if (newsFeed.multimedia?.audio) {
    mappedNewsFeed.multimedia = mappedNewsFeed.multimedia ?? {};

    const audioProperties = newsFeed.multimedia.audio;
    mappedNewsFeed.multimedia.audio = {
      url: audioProperties.url,
      bucketName: audioProperties.bucketName,
    };
  }

  if (newsFeed.multimedia?.video) {
    mappedNewsFeed.multimedia = mappedNewsFeed.multimedia ?? {};

    const videoProperties = newsFeed.multimedia.video;
    mappedNewsFeed.multimedia.video = {
      url: videoProperties.url,
      bucketName: videoProperties.bucketName,
    };
  }

  if (newsFeed.connectType) {
    mappedNewsFeed.attributes = {
      connectType: newsFeed.connectType,
    };

    if (newsFeed.connectDescription) {
      mappedNewsFeed.attributes.description = newsFeed.connectDescription;
    }

    if (newsFeed.connectedUser) {
      mappedNewsFeed.attributes.connectedUser = newsFeed.connectedUser;
    }
  }

  if (newsFeed.postedBy) {
    mappedNewsFeed.postedBy = newsFeed.postedBy;
  }

  if (newsFeed.status && newsFeed.status in StatusEnum) {
    mappedNewsFeed.status = newsFeed.status as StatusEnum;
  }

  if (newsFeed.priority && newsFeed.priority in PriorityEnum) {
    mappedNewsFeed.priority = newsFeed.priority as PriorityEnum;
  } else {
    mappedNewsFeed.priority = PriorityEnum.Medium;
  }

  if (newsFeed.expiresAt) {
    mappedNewsFeed.expiresAt = newsFeed.expiresAt;
  }

  if (newsFeed.publishedAt) {
    mappedNewsFeed.publishedAt = new Date(newsFeed.publishedAt);
  }

  if (newsFeed.createdAt) {
    mappedNewsFeed.createdAt = new Date(newsFeed.createdAt);
  }

  if (newsFeed.updatedAt) {
    mappedNewsFeed.updatedAt = new Date(newsFeed.updatedAt);
  }

  if (typeof newsFeed.isDeleted === 'boolean') {
    mappedNewsFeed.isDeleted = newsFeed.isDeleted;
  }

  return mappedNewsFeed as OBNewsSchemaType;
};

const mapNewsApiRequestToServiceRequest = (
  requestData: HttpPOSTCreateOBNewsFeed,
  file?: ObNewsFileBufferTypeData,
): OBNewsFeedUpsertOperationType => {
  const {
    overrideId,
    newsId,
    title,
    description,
    category,
    audienceLevel,
    branchIds,
    provincialCodes,
    divisionIds,
    isShareable,
    imageUrl,
    audioUrl,
    videoUrl,
    recognizedUserId,
    approvedById,
    status,
    priority,
    expiresInDays,
    fileType,
    mediaType,
  } = requestData;

  const mappedPayload: Partial<OBNewsFeedUpsertOperationType> = { newsId };

  if (overrideId) {
    mappedPayload.newsId = overrideId;
  }

  if (title) {
    mappedPayload.title = title;
  }

  if (description) {
    mappedPayload.description = description;
  }

  if (category) {
    mappedPayload.category = category;
  }

  if (audienceLevel && audienceLevel in AudienceEnum) {
    mappedPayload.audienceLevel = audienceLevel;
  }

  if (Array.isArray(branchIds) && branchIds.length > 0) {
    mappedPayload.branchIds = branchIds;
  }

  if (Array.isArray(provincialCodes) && provincialCodes.length > 0) {
    const validProvincialCodes: ProvincialCodesEnum[] = [];

    provincialCodes.forEach((provincialCode) => {
      if (provincialCode in ProvincialCodesEnum) {
        validProvincialCodes.push(provincialCode as ProvincialCodesEnum);
      }
    });

    mappedPayload.provincialCodes = validProvincialCodes;
  }

  if (Array.isArray(divisionIds) && divisionIds.length > 0) {
    mappedPayload.divisionIds = divisionIds;
  }

  if (typeof isShareable !== 'undefined') {
    mappedPayload.visibility = isShareable ? NewsVisibilityEnum.All : NewsVisibilityEnum.Self;
  }

  if (fileType === FileTransportEnum.Link) {
    mappedPayload.multimedia = {
      type: FileTransportEnum.Link,
    };

    if (imageUrl) {
      mappedPayload.multimedia = {
        ...mappedPayload.multimedia,
        image: {
          url: imageUrl,
          bucketName: bucketNameS3,
        },
      };
    }

    if (audioUrl) {
      mappedPayload.multimedia = {
        ...mappedPayload.multimedia,
        audio: {
          url: audioUrl,
          bucketName: bucketNameS3,
        },
      };
    }

    if (videoUrl) {
      mappedPayload.multimedia = {
        ...mappedPayload.multimedia,
        video: {
          url: videoUrl,
          bucketName: bucketNameS3,
        },
      };
    }
  }

  if (fileType === FileTransportEnum.Buffer) {
    mappedPayload.multimedia = {
      type: FileTransportEnum.Buffer,
    };

    const fileData = {
      fieldName: file.fieldName,
      originalName: file.originalName,
      encoding: file.encoding,
      mimetype: file.mimetype,
      size: file.size,
      buffer: file.buffer,
    };

    if (mediaType === MultiMediaEnum.Image) {
      mappedPayload.multimedia = {
        ...mappedPayload.multimedia,
        image: {
          buffer: fileData,
          bucketName: bucketNameS3,
        },
      };
    }

    if (mediaType === MultiMediaEnum.Audio) {
      mappedPayload.multimedia = {
        ...mappedPayload.multimedia,
        audio: {
          buffer: fileData,
          bucketName: bucketNameS3,
        },
      };
    }

    if (mediaType === MultiMediaEnum.Video) {
      mappedPayload.multimedia = {
        ...mappedPayload.multimedia,
        video: {
          buffer: fileData,
          bucketName: bucketNameS3,
        },
      };
    }
  }

  if (recognizedUserId) {
    mappedPayload.connectedUser = {
      employeePsId: recognizedUserId,
    };

    mappedPayload.connectType = NewsFeedEnum.Recognition;
  }

  if (approvedById) {
    mappedPayload.approvedBy = {
      employeePsId: approvedById,
    };
  }

  if (status && status in StatusEnum) {
    mappedPayload.status = status as StatusEnum;
  }

  if (priority && priority in PriorityEnum) {
    mappedPayload.priority = priority as PriorityEnum;
  }

  if (expiresInDays) {
    mappedPayload.expiresAt = addDays(new Date(), expiresInDays);
  }

  return mappedPayload as OBNewsFeedUpsertOperationType;
};

const mapDBNewsToApiPayload = (obNewsFeed: NormalizedNewsFeedType): NewsFeedPayloadType => {
  const mappedNews: Partial<NewsFeedPayloadType> = {};

  const { news, additionalDetails } = obNewsFeed;

  if (news.newsId) {
    mappedNews.postId = news.newsId;
  }

  if (news.title) {
    mappedNews.postTitle = news.title;
  }

  if (news.description) {
    mappedNews.postDescription = news.description;
  }

  if (news.category) {
    mappedNews.postType = news.category;
  }

  if (news.category === NewsFeedEnum.Recognition) {
    const connectedUser = news.attributes.connectedUser;
    mappedNews.employeeRecognized = {
      employeePsId: connectedUser.employeePsId,
      displayName: connectedUser.displayName,
      userImageLink: connectedUser.userImageLink,
    };
  }

  if (news.audienceLevel) {
    mappedNews.postTag = news.audienceLevel;
  }

  if (news.multimedia?.image) {
    mappedNews.postImageUrl = additionalDetails.signedImageUrl;
    mappedNews.postImageOrientation = news.multimedia.image.orientation;
    // TODO to add audio and video
  }

  if (news.postedBy) {
    mappedNews.employeePosted = {
      employeeId: news.postedBy.employeePsId,
      employeeName: news.postedBy.displayName,
      profileImage: news.postedBy.userImageLink ?? null,
    };
  }

  if (news.priority) {
    mappedNews.priority = news.priority;
  }

  mappedNews.reaction = {
    allReactionTypes: Object.values(ReactionEnum),
    count: 0,
    currentReactionType: null,
    isReacted: false,
    sampleReactedUsers: [],
  };

  if (Array.isArray(news.sampleUserReactions) && news.sampleUserReactions.length) {
    mappedNews.reaction.sampleReactedUsers = news.sampleUserReactions.map((ele) => ele.displayName);
  }

  if (additionalDetails.currentUserReaction) {
    mappedNews.reaction.isReacted = additionalDetails.currentUserReaction.isReacted;
    mappedNews.reaction.currentReactionType = additionalDetails.currentUserReaction.reactionType;
  }

  if (Array.isArray(news.totalReactionAggregate) && news.totalReactionAggregate.length) {
    mappedNews.reaction.count = news.totalReactionAggregate.reduce(
      (total, currentValue) => total + currentValue.totalCount,
      0,
    );
  }

  if (news.createdAt) {
    mappedNews.postCreatedDate = news.createdAt;
  }

  return mappedNews as NewsFeedPayloadType;
};

const mapNewsInteractionRequestToServiceRequest = (
  requestData: HttpPOSTNewsInteraction,
): OBNewsInteractedOperationType => {
  const { newsId, reactionType } = requestData;

  const mappedPayload: Partial<OBNewsInteractedOperationType> = { newsId };

  if (reactionType && reactionType in ReactionEnum) {
    mappedPayload.reactionType = reactionType as ReactionEnum;
  } else if (reactionType in ReactionUndoEnum) {
    mappedPayload.reactionType = reactionType as ReactionUndoEnum;
  }

  return mappedPayload as OBNewsInteractedOperationType;
};

const mapNewsInteractionRequestToDBRecord = (
  newsInteractionData: Partial<OBNewsInteractedOperationType>,
): Partial<OBNewsInteractionSchemaType> => {
  const mappedNewsInteracted: Partial<OBNewsInteractionSchemaType> = {
    newsId: newsInteractionData.newsId,
  };

  if (newsInteractionData.title) {
    mappedNewsInteracted.title = newsInteractionData.title;
  }

  if (newsInteractionData.category && newsInteractionData.category in NewsFeedEnum) {
    mappedNewsInteracted.category = newsInteractionData.category as NewsFeedEnum;
  }

  if (newsInteractionData.reactionType && newsInteractionData.reactionType in ReactionEnum) {
    mappedNewsInteracted.reactionType = newsInteractionData.reactionType as ReactionEnum;
  }

  if (newsInteractionData.reactedUserPsId) {
    mappedNewsInteracted.reactedUserPsId = newsInteractionData.reactedUserPsId;
  }

  if (newsInteractionData.userDisplayName) {
    mappedNewsInteracted.userDisplayName = newsInteractionData.userDisplayName;
  }

  if (newsInteractionData.userImageLink) {
    mappedNewsInteracted.userImageLink = newsInteractionData.userImageLink;
  }

  return mappedNewsInteracted as OBNewsInteractionSchemaType;
};

export {
  mapNewsFeedRequestToDBRecord,
  mapNewsApiRequestToServiceRequest,
  mapDBNewsToApiPayload,
  mapNewsInteractionRequestToServiceRequest,
  mapNewsInteractionRequestToDBRecord,
};
