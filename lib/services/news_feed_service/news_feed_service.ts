import config from 'config';
import { FilterQuery, QueryOptions, PipelineStage } from 'mongoose';
import { notificationService } from '..';
import {
  AudienceEnum,
  NewsFeedEnum,
  ReactionEnum,
  StatusEnum,
  ReadFileTypeEnum,
  S3FoldersEnum,
  ReactionUndoEnum,
  UserLevelEnum,
  NotificationPlacementEnum,
  NotificationOriginEnum,
  NotificationTypeEnum,
  PriorityEnum,
} from '../../enums';
import { logError, logInfo } from '../../log/util';
import { OBNewsInteractionModel, OBNewsModel } from '../../models';
import {
  OBNewsFeedUpsertOperationType,
  OBNewsSchemaType,
  OBNewsInteractedOperationType,
  OBUserSchemaType,
  OBNewsInteractionSchemaType,
  NormalizedNewsFeedType,
  OBStorySummaryDataType,
} from '../../types';
import {
  createNanoId,
  getAudienceVisibilityFeature,
  prefixNewsFeedId,
  mapNewsFeedRequestToDBRecord,
  mapNewsInteractionRequestToDBRecord,
  getEffectiveBranchIds,
} from '../../utils';
import * as multiMediaService from '../multimedia_service/multimedia_service';
import * as userService from '../user_service/user_service';

const recognitionsConfig: { notifyUser: boolean } = config.get('Features.recognitions');

const createNews = async (
  transactionId: string,
  newsFeedData: OBNewsFeedUpsertOperationType,
): Promise<OBNewsSchemaType> => {
  try {
    if (!newsFeedData.audienceLevel) {
      throw new Error('Required fields are missing');
    }

    switch (newsFeedData.audienceLevel) {
      case AudienceEnum.Branch:
        if (!Array.isArray(newsFeedData.branchIds) || newsFeedData.branchIds.length === 0) {
          throw new Error('Missing mandatory field');
        }
        break;
      case AudienceEnum.Division:
        if (!Array.isArray(newsFeedData.divisionIds) || newsFeedData.divisionIds.length === 0) {
          throw new Error('Missing mandatory field');
        }
        break;
      case AudienceEnum.Province:
        if (!Array.isArray(newsFeedData.provincialCodes) || newsFeedData.provincialCodes.length === 0) {
          throw new Error('Missing mandatory field');
        }
        break;
      default:
        newsFeedData.audienceLevel = AudienceEnum.National;
        break;
    }

    if (!newsFeedData.newsId) {
      const id = createNanoId(5);
      newsFeedData.newsId = prefixNewsFeedId(id, NewsFeedEnum.News);
    }

    if (newsFeedData.multimedia) {
      newsFeedData.multimedia = await multiMediaService.storeMultiMedia(
        transactionId,
        newsFeedData.multimedia,
        S3FoldersEnum.News,
      );
    }

    newsFeedData.status = StatusEnum.Approved;
    newsFeedData.publishedAt = new Date();

    const translatedNews = mapNewsFeedRequestToDBRecord(newsFeedData);

    logInfo(`[${transactionId}] [SERVICE] createNews - create record initiated for newsId: ${translatedNews.newsId}`);

    const newObNews = new OBNewsModel(translatedNews);

    // Storing the record
    const createdNews = await newObNews.save();

    const createdData = createdNews.toJSON();

    logInfo(`[${transactionId}] [SERVICE] createNews - create record SUCCESSFUL for newsId: ${translatedNews.newsId}`);

    return createdData;
  } catch (createErr) {
    logError(
      `[${transactionId}] [SERVICE] createNews - ERROR creating news feed ${newsFeedData.newsId}, reason: ${createErr.message}`,
    );

    throw createErr;
  }
};

const createStory = async (
  transactionId: string,
  storyData: OBNewsFeedUpsertOperationType,
): Promise<OBNewsSchemaType> => {
  try {
    if (!storyData.newsId) {
      const id = createNanoId(5);
      storyData.newsId = prefixNewsFeedId(id, NewsFeedEnum.Story);
    }

    storyData.audienceLevel = getAudienceVisibilityFeature(NewsFeedEnum.Story);

    if (storyData.multimedia) {
      storyData.multimedia = await multiMediaService.storeMultiMedia(
        transactionId,
        storyData.multimedia,
        S3FoldersEnum.News,
      );
    }

    const translatedStory = mapNewsFeedRequestToDBRecord(storyData);

    logInfo(`[${transactionId}] [SERVICE] createStory - create record initiated for newsId: ${translatedStory.newsId}`);

    const newObStory = new OBNewsModel(translatedStory);

    // Storing the record
    const createdStory = await newObStory.save();

    const createdStoryData = createdStory.toJSON();

    logInfo(
      `[${transactionId}] [SERVICE] createStory - create record SUCCESSFUL for newsId: ${translatedStory.newsId}`,
    );

    return createdStoryData;
  } catch (createErr) {
    logError(
      `[${transactionId}] [SERVICE] createStory - ERROR creating news feed  ${storyData.newsId}, reason: ${createErr.message}`,
    );

    throw createErr;
  }
};

const createRecognition = async (
  transactionId: string,
  recognitionData: OBNewsFeedUpsertOperationType,
): Promise<OBNewsSchemaType> => {
  try {
    if (!recognitionData.connectedUser) {
      throw new Error('Required fields are missing');
    }

    const recognizedUser = await userService.getObUsersByPsId(
      transactionId,
      recognitionData.connectedUser.employeePsId,
    );

    if (!recognizedUser) {
      throw new Error('Recognized User Not Found!');
    }

    const effectiveBranchIds: string[] = getEffectiveBranchIds(
      recognizedUser.branchAccess.overriddenBranchIds,
      recognizedUser.branchAccess.selectedBranchIds,
    );

    if (Array.isArray(effectiveBranchIds) && effectiveBranchIds.length) {
      recognitionData.branchIds = effectiveBranchIds;
    }

    recognitionData.connectedUser.displayName = recognizedUser.displayName;
    if (recognizedUser.tempProfile && recognizedUser.tempProfile.tempProfileImgUrl) {
      recognitionData.connectedUser.userImageLink = recognizedUser.tempProfile.tempProfileImgUrl;
    }

    if (!recognitionData.newsId) {
      const id = createNanoId(5);
      recognitionData.newsId = prefixNewsFeedId(id, NewsFeedEnum.Recognition);
    }

    recognitionData.audienceLevel = getAudienceVisibilityFeature(NewsFeedEnum.Recognition);
    recognitionData.status = StatusEnum.Approved;
    recognitionData.publishedAt = new Date();

    const translatedRecognition = mapNewsFeedRequestToDBRecord(recognitionData);

    logInfo(
      `[${transactionId}] [SERVICE] createStory - create record initiated for newsId: ${translatedRecognition.newsId}`,
    );

    const newObRecognition = new OBNewsModel(translatedRecognition);

    // Storing the record
    const createdRecognition = await newObRecognition.save();

    const createdData = createdRecognition.toJSON();

    if (recognitionsConfig.notifyUser) {
      await notificationService.sendNotification(transactionId, {
        audienceLevel: AudienceEnum.Individual,
        userPsIds: [recognizedUser.employeePsId],
        notificationTitle: 'Congratulations',
        notificationBody: `${recognitionData.postedBy.displayName ?? 'A Colleague'} Has Recognized You!`,
        notificationPlacements: [NotificationPlacementEnum.Push],
        notificationOrigin: NotificationOriginEnum.System,
        notificationType: NotificationTypeEnum.Individual,
        notificationVisibility: AudienceEnum.Individual,
        priority: PriorityEnum.High,
        isClearable: true,
      });

      logInfo(
        `[${transactionId}] [SERVICE] createRecognition - Notification successfully sent to employeePsId: ${recognizedUser.employeePsId}`,
      );
    }
    logInfo(
      `[${transactionId}] [SERVICE] createRecognition - create record SUCCESSFUL for newsId: ${translatedRecognition.newsId}`,
    );

    return createdData;
  } catch (createErr) {
    logError(
      `[${transactionId}] [SERVICE] createRecognition - ERROR creating news feed ${recognitionData.newsId}, reason: ${createErr.message}`,
    );

    throw createErr;
  }
};

const createOBNewsFeed = async (
  transactionId: string,
  newsFeedData: OBNewsFeedUpsertOperationType,
): Promise<OBNewsSchemaType> => {
  try {
    if (!newsFeedData.category || !newsFeedData.title || !newsFeedData.description) {
      throw new Error('Required fields are missing');
    }

    const psIds = new Set<string>();

    if (newsFeedData.postedBy) {
      psIds.add(newsFeedData.postedBy.employeePsId);
    }

    if (newsFeedData.approvedBy) {
      psIds.add(newsFeedData.approvedBy.employeePsId);
    }

    if (psIds.size) {
      const employees: OBUserSchemaType[] = await userService.getObUsersByPsIds(transactionId, Array.from(psIds));

      const postedByEmployee = employees.find((emp) => emp.employeePsId === newsFeedData.postedBy?.employeePsId);
      const approvedByEmployee = employees.find((emp) => emp.employeePsId === newsFeedData.approvedBy?.employeePsId);

      if (postedByEmployee) {
        newsFeedData.postedBy = {
          employeePsId: postedByEmployee.employeePsId,
          displayName: postedByEmployee.displayName,
          userImageLink: postedByEmployee.tempProfile?.tempProfileImgUrl,
        };
      }

      if (approvedByEmployee) {
        newsFeedData.approvedBy = {
          employeePsId: approvedByEmployee.employeePsId,
          displayName: approvedByEmployee.displayName,
        };
      }
    }

    let newsData: OBNewsSchemaType;
    if (newsFeedData.category === NewsFeedEnum.News) {
      newsData = await createNews(transactionId, newsFeedData);
    } else if (newsFeedData.category === NewsFeedEnum.Story) {
      if (Array.isArray(newsFeedData.currentUser.branchIds) && newsFeedData.currentUser.branchIds.length) {
        newsFeedData.branchIds = newsFeedData.currentUser.branchIds;
      }

      if (newsFeedData.currentUser.jobLevel && newsFeedData.currentUser.jobLevel >= 5) {
        newsFeedData.status = StatusEnum.Approved;
        newsFeedData.publishedAt = new Date();
      } else {
        newsFeedData.status = StatusEnum.Pending;
      }
      newsData = await createStory(transactionId, newsFeedData);
    } else if (newsFeedData.category === NewsFeedEnum.Recognition) {
      newsData = await createRecognition(transactionId, newsFeedData);
    } else {
      throw new Error('Invalid Category');
    }

    return newsData;
  } catch (createErr) {
    logError(
      `[${transactionId}] [SERVICE] createOBNewsFeed - ERROR creating news feed ${newsFeedData.newsId}, reason: ${createErr.message}`,
    );

    throw createErr;
  }
};

const updateOBNews = async (
  transactionId: string,
  partialNewsData: Partial<OBNewsFeedUpsertOperationType>,
): Promise<OBNewsSchemaType> => {
  logInfo(`[${transactionId}] [SERVICE] updateNews- updating news for newsId: ${partialNewsData.newsId}`);

  try {
    if (partialNewsData.status === StatusEnum.Approved) {
      partialNewsData.publishedAt = new Date();
    }

    if (partialNewsData.multimedia) {
      partialNewsData.multimedia = await multiMediaService.storeMultiMedia(
        transactionId,
        partialNewsData.multimedia,
        S3FoldersEnum.News,
      );
    }

    const translatedNews = mapNewsFeedRequestToDBRecord(partialNewsData);

    const updatedNews = await OBNewsModel.findOneAndUpdate(
      {
        newsId: partialNewsData.newsId,
      },
      { ...translatedNews, updatedAt: new Date() },
      { new: true },
    );

    if (!updatedNews) {
      throw new Error('News Not Found!');
    }

    logInfo(`[${transactionId}] [SERVICE] updateNews - SUCCESSFUL for newsId: ${updatedNews.newsId}`);

    return updatedNews;
  } catch (updateErr) {
    logError(
      `[${transactionId}] [SERVICE] updateNews - FAILED for newsId: ${partialNewsData.newsId}, reason: ${updateErr.message}`,
    );
    throw updateErr;
  }
};

const getNewsByNewsIds = async (transactionId: string, newsIds: string[]): Promise<OBNewsSchemaType[]> => {
  const matchingNews: OBNewsSchemaType[] = [];

  logInfo(
    `[${transactionId}] [SERVICE] getNewsByNewsIds - find previous entries, requested: ${JSON.stringify(newsIds)}`,
  );

  try {
    const newsCursor = OBNewsModel.find({
      newsId: {
        $in: newsIds,
      },
    }).cursor();

    for await (const news of newsCursor) {
      matchingNews.push(news.toJSON());
    }
  } catch (readError) {
    logError(
      `[${transactionId}] [SERVICE] getNewsByNewsIds - ERROR reading previous collections, reason: ${readError.message}`,
    );

    throw new Error('Unable to read to previous entries');
  }

  return matchingNews;
};

const removeNewsByNewsId = async (transactionId: string, removeNewsId: string, force = false): Promise<string> => {
  try {
    logInfo(`[${transactionId}] [SERVICE] removeNewsByNewsId - Removing news ${removeNewsId}`);

    if (!removeNewsId) {
      throw new Error('Provide a valid newsId to remove');
    }

    if (force) {
      // Hard Delete
      const { deletedCount } = await OBNewsModel.deleteOne({ newsId: removeNewsId });

      logInfo(
        `[${transactionId}] [SERVICE] removeNewsByNewsId - Hard Removing news SUCCESSFUL for newsId: ${removeNewsId}, deletedCount: ${deletedCount}`,
      );
    } else {
      // Soft Delete
      await OBNewsModel.findOneAndUpdate(
        { newsId: removeNewsId },
        { isDeleted: true, updatedAt: new Date() },
        { new: true },
      );

      logInfo(
        `[${transactionId}] [SERVICE] removeNewsByNewsId - Soft Removing news SUCCESSFUL for newsId: ${removeNewsId}`,
      );
    }

    return removeNewsId;
  } catch (removeErr) {
    logError(`[${transactionId}] [SERVICE] removeNewsByNewsId - Removing news FAILED, reason: ${removeErr.message}`);

    throw removeErr;
  }
};

const getNewsFeedByFilter = async (
  transactionId: string,
  userDetails: {
    userPsId: string;
    branchIds: string[];
    divisionIds: string[];
    provincialCodes: string[];
    jobLevel: number;
    accessLevelName: UserLevelEnum;
  },
  viewAs: string,
  filters: FilterQuery<OBNewsSchemaType>,
  options?: {
    limit: number;
    skip: number;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
    search?: string;
  },
): Promise<NormalizedNewsFeedType[]> => {
  logInfo(
    `[${transactionId}] [SERVICE] getNewsFeedByFilter - find all news by filters: ${JSON.stringify(
      filters,
    )}, options: ${JSON.stringify(options)}`,
  );

  const searchQuery: FilterQuery<OBNewsSchemaType> = {};
  if (options && options.search) {
    const searchRegex = new RegExp(options.search, 'i');
    searchQuery.$or = [{ title: searchRegex }, { description: searchRegex }, { 'postedBy.displayName': searchRegex }];
  }

  const sortQuery: QueryOptions<OBNewsSchemaType> = {};
  if (options && options.sortField) {
    sortQuery[options.sortField] = options.sortOrder === 'asc' ? 1 : -1;
  } else {
    sortQuery.publishedAt = -1; // Default sort by publishedAt in descending order
  }

  try {
    const newsQueryCursor = OBNewsModel.find({ ...filters, ...searchQuery })
      .sort(sortQuery)
      .skip(options.skip)
      .limit(options.limit)
      .cursor();

    const newsFeed: OBNewsSchemaType[] = [];

    for await (const news of newsQueryCursor) {
      newsFeed.push(news.toJSON());
    }

    let filteredNewsFeed: OBNewsSchemaType[] = [];

    newsFeed?.forEach((news) => {
      switch (true) {
        case news.audienceLevel === AudienceEnum.National:
        case news.branchIds.includes('*') ||
          userDetails.branchIds.includes('*') ||
          (news.audienceLevel === AudienceEnum.Branch &&
            news.branchIds.some((id) => userDetails.branchIds.includes(id))):
        case news.divisionIds.includes('*') ||
          userDetails.divisionIds.includes('*') ||
          (news.audienceLevel === AudienceEnum.Division &&
            news.divisionIds.some((id) => userDetails.divisionIds.includes(id))):
        case userDetails.provincialCodes.includes('*') ||
          (news.audienceLevel === AudienceEnum.Province &&
            news.provincialCodes.some((id) => userDetails.provincialCodes.includes(id))):
          filteredNewsFeed.push(news);
          break;
        default:
      }
    });

    if (!filteredNewsFeed.length) {
      return [];
    }

    const usersHash: {
      [psId: string]: OBUserSchemaType;
    } = {};

    // For web app listing - filter news based on job level for branch admins
    if (
      viewAs &&
      viewAs.toLowerCase() === UserLevelEnum.ADMIN.toLowerCase() &&
      userDetails.accessLevelName !== UserLevelEnum.FIELD_STAFF &&
      userDetails.accessLevelName !== UserLevelEnum.SUPER_ADMIN
    ) {
      const psIds = filteredNewsFeed.map((news) => news.postedBy.employeePsId);

      const users = await userService.getObUsersByFilter(transactionId, {
        employeePsId: { $in: psIds },
        'job.level': { $lt: userDetails.jobLevel },
      });

      users.forEach((user) => {
        usersHash[user.employeePsId] = user;
      });

      filteredNewsFeed = filteredNewsFeed.filter((news) => usersHash[news.postedBy.employeePsId]);
    }

    const previousReactionHash: {
      [newsId: string]: OBNewsInteractionSchemaType;
    } = {};

    const previousNewsFeedReactions = await OBNewsInteractionModel.find({
      newsId: {
        $in: filteredNewsFeed.map(({ newsId }) => newsId),
      },
      reactedUserPsId: userDetails.userPsId,
    });

    previousNewsFeedReactions.forEach((newsFeedReaction) => {
      previousReactionHash[newsFeedReaction.newsId] = newsFeedReaction;
    });

    const normalizedNewsFeed = await Promise.all(
      filteredNewsFeed.map(async (news) => {
        return normalizeNews(
          transactionId,
          news,
          { currentUserPsId: userDetails.userPsId },
          previousReactionHash[news.newsId] ?? null,
        );
      }),
    );

    logInfo(
      `[${transactionId}] [SERVICE] getNewsFeedByFilter - total news retrieved filters: ${JSON.stringify(filters)}`,
    );

    return normalizedNewsFeed;
  } catch (listErr) {
    logError(`[${transactionId}] [SERVICE] getNewsFeedByFilter - FAILED,  reason: ${listErr.message}`);
    throw listErr;
  }
};

const normalizeNews = async (
  transactionId: string,
  news: OBNewsSchemaType,
  additionalDetails: { currentUserPsId: string },
  currentUserReaction?: OBNewsInteractionSchemaType,
): Promise<NormalizedNewsFeedType> => {
  logInfo(`[${transactionId}] [SERVICE] normalizeNews - normalize news : ${JSON.stringify(news)}`);

  try {
    let signedImageUrl: unknown;
    let signedAudioUrl: unknown;
    if (news.multimedia?.image?.url) {
      signedImageUrl = (await multiMediaService.readFileFromS3(transactionId, {
        key: news.multimedia.image.url,
        readType: ReadFileTypeEnum.PresignedUrl,
      })) as string;
    }

    if (news.multimedia?.audio?.url) {
      signedAudioUrl = (await multiMediaService.readFileFromS3(transactionId, {
        key: news.multimedia.audio.url,
        readType: ReadFileTypeEnum.PresignedUrl,
      })) as string;
    }

    // Append recognized user's name in title
    if (news.category === NewsFeedEnum.Recognition) {
      news.title = `${news.title.replace('as', `${news.attributes.connectedUser.displayName} as`)}`;
    }

    news.sampleUserReactions = currentUserReaction
      ? news.sampleUserReactions.filter((user) => user.employeePsId !== additionalDetails.currentUserPsId)
      : news.sampleUserReactions;

    return {
      news,
      additionalDetails: {
        signedImageUrl: signedImageUrl as string,
        signedAudioUrl: signedAudioUrl as string,
        currentUserReaction: {
          isReacted: Boolean(currentUserReaction),
          reactionType: (currentUserReaction?.reactionType as ReactionEnum) ?? null,
        },
      },
    };
  } catch (error) {
    logError(
      `[${transactionId}] [SERVICE] normalizeNews - FAILED for newsId: ${news.newsId}, reason: ${error.message}`,
    );
    throw error;
  }
};

const newsInteracted = async (
  transactionId: string,
  newsInteractionData: OBNewsInteractedOperationType,
): Promise<string> => {
  logInfo(`[${transactionId}] [SERVICE] newsInteracted initiated for ${newsInteractionData.newsId}`);

  try {
    const existingNews = await OBNewsModel.findOne({ newsId: newsInteractionData.newsId });

    if (!existingNews) {
      throw new Error('News Not Found!');
    }

    newsInteractionData.title = existingNews.title;
    newsInteractionData.category = existingNews.category;

    // check if user has already reacted on a news
    const existingNewsReaction = await OBNewsInteractionModel.findOne({
      newsId: newsInteractionData.newsId,
      reactedUserPsId: newsInteractionData.reactedUserPsId,
    });

    if (existingNewsReaction) {
      if (existingNewsReaction.reactionType === newsInteractionData.reactionType) {
        return newsInteractionData.newsId;
      }
    }

    const translatedNewsInteraction = mapNewsInteractionRequestToDBRecord(newsInteractionData);

    if (translatedNewsInteraction.reactionType in ReactionEnum) {
      logInfo(
        `[${transactionId}] [SERVICE] newsInteraction - create record initiated for news interacted: ${translatedNewsInteraction.newsId}`,
      );

      const newObNewsInteraction = new OBNewsInteractionModel(translatedNewsInteraction);

      // Storing the record
      await newObNewsInteraction.save();

      logInfo(
        `[${transactionId}] [SERVICE] newsInteraction - create record SUCCESSFUL for newsId: ${translatedNewsInteraction.newsId}`,
      );

      // update the total count in news-feed collection
      if (existingNews.totalReactionAggregate && existingNews.totalReactionAggregate.length) {
        const existingReactionType = existingNews.totalReactionAggregate.find(
          (reaction) => reaction.reactionType === translatedNewsInteraction.reactionType,
        );

        if (existingReactionType) {
          existingReactionType.totalCount += 1;
        } else {
          existingNews.totalReactionAggregate.push({
            reactionType: translatedNewsInteraction.reactionType,
            totalCount: 1,
          });
        }
      } else {
        existingNews.totalReactionAggregate = [
          {
            reactionType: translatedNewsInteraction.reactionType,
            totalCount: 1,
          },
        ];
      }

      if (existingNews.sampleUserReactions && existingNews.sampleUserReactions.length >= 10) {
        existingNews.sampleUserReactions.shift();
      }
      existingNews.sampleUserReactions.push({
        employeePsId: translatedNewsInteraction.reactedUserPsId,
        displayName: translatedNewsInteraction.userDisplayName,
        reactionType: translatedNewsInteraction.reactionType,
      });
    }

    if (newsInteractionData.reactionType in ReactionUndoEnum) {
      if (existingNewsReaction) {
        await existingNewsReaction.deleteOne();
      }

      if (existingNews.totalReactionAggregate && existingNews.totalReactionAggregate.length) {
        let existingReactionType: {
          reactionType: ReactionEnum;
          totalCount: number;
        };

        if (newsInteractionData.reactionType === ReactionUndoEnum.Unlike) {
          existingReactionType = existingNews.totalReactionAggregate.find(
            (reaction) => reaction.reactionType === ReactionEnum.Like,
          );
        } else if (newsInteractionData.reactionType === ReactionUndoEnum.Uncool) {
          existingReactionType = existingNews.totalReactionAggregate.find(
            (reaction) => reaction.reactionType === ReactionEnum.Cool,
          );
        } else {
          existingReactionType = existingNews.totalReactionAggregate.find(
            (reaction) => reaction.reactionType === ReactionEnum.Funny,
          );
        }

        if (existingReactionType && existingReactionType.totalCount >= 1) {
          existingReactionType.totalCount -= 1;
        }
      }

      if (existingNews.sampleUserReactions && existingNews.sampleUserReactions.length) {
        const modifiedSampleUserReactions = existingNews.sampleUserReactions.filter(
          (user) => user.employeePsId !== translatedNewsInteraction.reactedUserPsId,
        );

        existingNews.sampleUserReactions = modifiedSampleUserReactions;
      }
    }

    await OBNewsModel.findOneAndUpdate(
      { newsId: existingNews.newsId },
      {
        totalReactionAggregate: existingNews.totalReactionAggregate,
        sampleUserReactions: existingNews.sampleUserReactions,
        updatedAt: new Date(),
      },
      { new: true },
    );

    logInfo(
      `[${transactionId}] [SERVICE] newsInteraction - update count in news-feed SUCCESSFUL for newsId: ${translatedNewsInteraction.newsId}`,
    );

    return translatedNewsInteraction.newsId;
  } catch (err) {
    logError(
      `[${transactionId}] [SERVICE] newsInteracted - ERROR while adding reaction for ${newsInteractionData.newsId}, reason: ${err.message}`,
    );

    throw err;
  }
};

const getStoriesData = async (transactionId: string, start: Date, end: Date): Promise<OBStorySummaryDataType[]> => {
  logInfo(`[${transactionId}] [SERVICE] getStoriesData - Retrieving stories data from: ${start}, to: ${end}`);

  try {
    const aggregationPipeline: PipelineStage[] = [
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          category: NewsFeedEnum.Story,
        },
      },
      {
        $unwind: '$branchIds',
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $group: {
          _id: '$branchIds',
          branchId: { $first: '$branchIds' },
          totalPendingRecords: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$status', StatusEnum.Pending] }, { $eq: ['$category', NewsFeedEnum.Story] }] },
                1,
                0,
              ],
            },
          },
          totalRecords: {
            $sum: {
              $cond: [{ $eq: ['$category', NewsFeedEnum.Story] }, 1, 0],
            },
          },
          latestStory: {
            $first: {
              $cond: [
                { $and: [{ $eq: ['$status', StatusEnum.Approved] }, { $eq: ['$category', NewsFeedEnum.Story] }] },
                { storyId: '$newsId', title: '$title', description: '$description', createdAt: '$createdAt' },
                null,
              ],
            },
          },
        },
      },
      {
        $project: {
          branchId: '$_id',
          totalPendingRecords: 1,
          totalRecords: 1,
          latestStory: 1,
        },
      },
    ];

    const aggregationResults = await OBNewsModel.aggregate(aggregationPipeline);

    logInfo(
      `[${transactionId}] [SERVICE] getStoriesData - Successfully retrieved stories data: ${JSON.stringify(
        aggregationResults,
      )}`,
    );

    return aggregationResults.map((result) => ({
      branchId: result.branchId,
      totalPendingRecords: result.totalPendingRecords ?? 0,
      totalRecords: result.totalRecords ?? 0,
      latestStory: result.latestStory,
    }));
  } catch (error) {
    logError(`[${transactionId}] [SERVICE] getStoriesData - FAILED due to error: ${error.message}`);
    throw error;
  }
};

export {
  createOBNewsFeed,
  updateOBNews,
  normalizeNews,
  getNewsFeedByFilter,
  getNewsByNewsIds,
  removeNewsByNewsId,
  newsInteracted,
  getStoriesData,
};
