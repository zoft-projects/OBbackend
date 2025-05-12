import { FilterQuery, QueryOptions, PipelineStage } from 'mongoose';
import { ActiveEnum, AudienceEnum, MongoCollection, PollInteractionStatusEnum, PollsEnum } from '../../enums';
import { logInfo, logError, logDebug } from '../../log/util';
import { OBPollInteractionModel, OBPollModel } from '../../models';
import {
  OBPollInteractionSchemaType,
  OBPollInteractionUpsertOperationType,
  OBPollUpsertOperationType,
  OBPollsSchemaType,
  OBPollInteractionsSummaryType,
  OBPollSummaryDataType,
} from '../../types';
import { createNanoId, mapPollInteractionToDBRecord, mapPollRequestToDBRecord, prefixPollId } from '../../utils';

const createPoll = async (transactionId: string, poll: OBPollUpsertOperationType): Promise<OBPollsSchemaType> => {
  try {
    if (!poll.title || !poll.accessLevelNames || !poll.audienceLevel || !poll.pollType) {
      throw new Error('Missing mandatory fields for creating poll: title, pollType, accessLevels, audienceLevel');
    }
    switch (poll.audienceLevel) {
      case AudienceEnum.Branch:
        if (!Array.isArray(poll.branchIds) || poll.branchIds.length === 0) {
          throw new Error('Missing mandatory field branchIds');
        }
        break;
      case AudienceEnum.Division:
        if (!Array.isArray(poll.divisionIds) || poll.divisionIds.length === 0) {
          throw new Error('Missing mandatory field divisionIds');
        }
        break;
      case AudienceEnum.Province:
        if (!Array.isArray(poll.provincialCodes) || poll.provincialCodes.length === 0) {
          throw new Error('Missing mandatory field provincialCodes');
        }
        break;
      default:
        poll.audienceLevel = AudienceEnum.National;
        break;
    }

    if (poll.pollType === PollsEnum.Choice && (!Array.isArray(poll.pollOptions) || poll.pollOptions.length === 0)) {
      throw new Error('Missing mandatory field pollOptions');
    }

    if (!poll.pollId) {
      const id = createNanoId(5);
      poll.pollId = prefixPollId(id);
    }

    const translatedPoll = mapPollRequestToDBRecord(poll);

    logInfo(`[${transactionId}] [SERVICE] createPoll - create record initiated for pollId: ${translatedPoll.pollId}`);

    const newObPoll = new OBPollModel(translatedPoll);

    const createdPoll = await newObPoll.save();

    const createdData = createdPoll.toJSON();

    logInfo(`[${transactionId}] [SERVICE] createPoll - create record SUCCESSFUL for pollId: ${translatedPoll.pollId}`);

    return createdData;
  } catch (createErr) {
    logError(
      `[${transactionId}] [SERVICE] createPoll - ERROR creating poll ${poll.pollId}, reason: ${createErr.message}`,
    );

    throw createErr;
  }
};

const updatePoll = async (
  transactionId: string,
  pollPartialFields: Partial<OBPollUpsertOperationType>,
): Promise<OBPollsSchemaType> => {
  logInfo(`[${transactionId}] [SERVICE] updatePoll - updating job for pollId: ${pollPartialFields.pollId}`);

  try {
    if (!pollPartialFields.pollId) {
      throw new Error('Missing mandatory field pollId for update');
    }

    const translatedPoll = mapPollRequestToDBRecord(pollPartialFields);

    const updatedPoll = await OBPollModel.findOneAndUpdate(
      {
        pollId: translatedPoll.pollId,
      },
      {
        ...translatedPoll,
        updatedAt: new Date(),
      },
      {
        new: true,
      },
    );

    logInfo(`[${transactionId}] [SERVICE] updatePoll - SUCCESSFUL for pollId: ${updatedPoll.pollId}`);

    return updatedPoll;
  } catch (updateErr) {
    logError(
      `[${transactionId}] [SERVICE] updatePoll - FAILED for pollId: ${pollPartialFields.pollId}, reason: ${updateErr.message}`,
    );
    logDebug(
      `[${transactionId}] [SERVICE] updatePoll - FAILED details, provided: ${JSON.stringify(pollPartialFields)}`,
    );

    throw updateErr;
  }
};

const getPollInteractionsByPollId = async (
  transactionId: string,
  pollId: string,
  options?: QueryOptions<OBPollsSchemaType>,
): Promise<OBPollInteractionSchemaType[]> => {
  try {
    const searchQuery: FilterQuery<OBPollInteractionSchemaType> = {};
    if (options && options.search) {
      const searchRegex = new RegExp(options.search, 'i');
      searchQuery.$or = [{ pollId: searchRegex }, { title: searchRegex }, { 'createdBy.displayName': searchRegex }];
    }

    const sortQuery: QueryOptions<OBPollInteractionSchemaType> = {};
    if (options && options.sortField) {
      sortQuery[options.sortField] = options.sortOrder === 'asc' ? 1 : -1;
    } else {
      sortQuery.createdAt = -1;
    }
    const pollInteractionsQueryCursor = OBPollInteractionModel.find({ pollId, ...searchQuery })
      .sort(sortQuery)
      .skip(options.skip)
      .limit(options.limit)
      .cursor();

    const pollInteractions: OBPollInteractionSchemaType[] = [];

    for await (const pollInteraction of pollInteractionsQueryCursor) {
      pollInteractions.push(pollInteraction.toJSON());
    }

    return pollInteractions;
  } catch (err) {
    logError(`[${transactionId}] [SERVICE] getPollInteractions - ERROR: ${err.message}`);
    throw err;
  }
};

const getPollInteractionByPollIdAndUserPsID = async (
  transactionId: string,
  pollId: string,
  obUserPsId: string,
): Promise<OBPollInteractionSchemaType> => {
  try {
    logInfo(
      `[${transactionId}] [SERVICE] getPollInteractionByPollIdAndUserPsID - get poll Interaction by poll ID & obUserPsId requested: ${pollId} , ${obUserPsId}`,
    );
    const pollInteraction = await OBPollInteractionModel.findOne({
      pollId,
      'interactedUser.employeePsId': obUserPsId,
    });

    return pollInteraction;
  } catch (err) {
    logError(`[${transactionId}] [SERVICE] getPollInteractions - ERROR: ${err}`);
    throw err;
  }
};

const getChoicePollInteractionsSummary = async (
  transactionId: string,
  pollId: string,
): Promise<OBPollInteractionsSummaryType> => {
  try {
    logInfo(
      `[${transactionId}] [SERVICE] getChoicePollInteractionsSummary - get poll choice votes summary by poll ID, requested: ${pollId}`,
    );

    const calculateTotalVotesQuery = [
      {
        $match: {
          pollId,
        },
      },
      {
        $unwind: '$selectionOptions',
      },
      {
        $group: {
          _id: '$selectionOptions',
          votes: { $sum: 1 },
        },
      },
      {
        $project: {
          option: '$_id',
          votes: 1,
          _id: 0,
        },
      },
      {
        $group: {
          _id: null,
          pollId: { $first: pollId },
          totalInteractions: { $sum: '$votes' },
          options: { $push: { option: '$option', votes: '$votes' } },
        },
      },
    ];

    const [pollChoiceVotesSummary] = await OBPollInteractionModel.aggregate(calculateTotalVotesQuery);

    logInfo(`[${transactionId}] [SERVICE] getChoicePollInteractionsSummary - Retrieved SUCCESSFUL`);

    return pollChoiceVotesSummary as OBPollInteractionsSummaryType;
  } catch (err) {
    logError(`[${transactionId}] [SERVICE] getChoicePollInteractionsSummary - ERROR: ${err.message}`);
    throw err;
  }
};

const getPollById = async (transactionId: string, pollId: string): Promise<OBPollsSchemaType> => {
  try {
    logInfo(`[${transactionId}] [SERVICE] getPollById - find poll by ID, requested: ${pollId}`);

    const poll = await OBPollModel.findOne({ pollId });

    logInfo(`[${transactionId}] [SERVICE] getPollById - find poll by ID, completed: ${pollId}`);

    return poll;
  } catch (readError) {
    logError(`[${transactionId}] [SERVICE] getPollById - ERROR reading poll, reason: ${readError.message}`);
    throw new Error('Unable to read poll by ID');
  }
};

const removePoll = async (transactionId: string, pollId: string, forceDelete = false): Promise<string> => {
  try {
    logInfo(`[${transactionId}] [SERVICE] removePoll - Removing poll ${pollId}`);

    if (!pollId) {
      throw new Error('Provide a valid pollId to remove');
    }

    if (forceDelete) {
      const { deletedCount } = await OBPollModel.deleteOne({ pollId });
      logInfo(
        `[${transactionId}] [SERVICE] removePoll - Hard Removing poll SUCCESSFUL for pollId: ${pollId}, deletedCount: ${deletedCount}`,
      );
    } else {
      await OBPollModel.findOneAndUpdate({ pollId }, { isDeleted: true, updatedAt: new Date() }, { new: true });

      logInfo(`[${transactionId}] [SERVICE] removePoll - Soft Removing poll SUCCESSFUL for pollId: ${pollId}`);
    }

    return pollId;
  } catch (removeErr) {
    logError(`[${transactionId}] [SERVICE] removePoll - Removing poll FAILED, reason: ${removeErr.message}`);

    throw removeErr;
  }
};

const getPolls = async (
  transactionId: string,
  filters: FilterQuery<OBPollsSchemaType>,
  options?: QueryOptions<OBPollsSchemaType>,
  additionalFilters?: {
    interaction: PollInteractionStatusEnum;
    userPsId: string;
    branchIds?: string[];
    divisionIds?: string[];
    provincialCodes?: string[];
    skipInteractionCheck?: boolean;
  },
): Promise<OBPollsSchemaType[]> => {
  logInfo(
    `[${transactionId}] [SERVICE] getPolls - find all polls by filters: ${JSON.stringify(
      filters,
    )}, options: ${JSON.stringify(options)}`,
  );

  try {
    const searchQuery: FilterQuery<OBPollsSchemaType> = {};
    if (options && options.search) {
      const searchRegex = new RegExp(options.search, 'i');
      searchQuery.$or = [{ pollId: searchRegex }, { title: searchRegex }, { 'createdBy.displayName': searchRegex }];
    }

    const sortQuery: QueryOptions<OBPollsSchemaType> = {};
    if (options && options.sortField) {
      sortQuery[options.sortField] = options.sortOrder === 'asc' ? 1 : -1;
    } else {
      sortQuery.createdAt = -1;
    }

    let pollInteractionQuery = {};

    if (!additionalFilters?.skipInteractionCheck) {
      const interactedPollIds = await OBPollInteractionModel.distinct('pollId', {
        'interactedUser.employeePsId': additionalFilters.userPsId,
      });

      pollInteractionQuery =
        additionalFilters?.interaction === PollInteractionStatusEnum.Interacted
          ? { pollId: { $in: interactedPollIds } }
          : { pollId: { $nin: interactedPollIds } };
    }

    const pollsQueryCursor = OBPollModel.find({ ...filters, ...searchQuery, ...pollInteractionQuery })
      .sort(sortQuery)
      .skip(options.skip)
      .limit(options.limit)
      .cursor();

    const polls: OBPollsSchemaType[] = [];

    for await (const poll of pollsQueryCursor) {
      polls.push(poll.toJSON());
    }

    logInfo(`[${transactionId}] [SERVICE] getPolls - total polls retrieved filters: ${JSON.stringify(filters)}`);

    return polls;
  } catch (listErr) {
    logError(`[${transactionId}] [SERVICE] getPolls - FAILED,  reason: ${listErr.message}`);
    throw listErr;
  }
};

const createPollInteraction = async (
  transactionId: string,
  pollInteraction: OBPollInteractionSchemaType,
): Promise<OBPollInteractionSchemaType> => {
  try {
    if (!pollInteraction.pollId || !pollInteraction.pollType) {
      throw new Error('Missing mandatory fields for creating pollInteraction: pollId, pollType');
    }

    logInfo(
      `[${transactionId}] [SERVICE] createPollInteraction - create record initiated for poll interaction for pollId: ${pollInteraction.pollId}`,
    );

    const newObPollInteraction = new OBPollInteractionModel(pollInteraction);

    const createdPollInteraction = await newObPollInteraction.save();

    const createdData = createdPollInteraction.toJSON();

    logInfo(
      `[${transactionId}] [SERVICE] createPollInteraction - create record SUCCESSFUL for pollId: ${newObPollInteraction.pollId}`,
    );

    return createdData;
  } catch (createErr) {
    logError(
      `[${transactionId}] [SERVICE] createPollInteraction - ERROR creating poll interaction ${pollInteraction.pollId}, reason: ${createErr.message}`,
    );

    throw createErr;
  }
};

const pollInteraction = async (
  transactionId: string,
  pollInteractionData: OBPollInteractionUpsertOperationType,
): Promise<string> => {
  try {
    if (
      pollInteractionData.pollType.toLowerCase() === PollsEnum.Choice.toLowerCase() &&
      pollInteractionData.selectionOptions?.length === 0
    ) {
      throw new Error('Missing mandatory fields for creating pollInteraction: Choices');
    }

    if (
      pollInteractionData.pollType.toLowerCase() === PollsEnum.Feedback.toLowerCase() &&
      ((!pollInteractionData.numOfStars && pollInteractionData.numOfStars !== 0) ||
        !pollInteractionData.feedbackComment)
    ) {
      throw new Error('Missing mandatory fields for creating pollInteraction: Feedback');
    }

    logInfo(
      `[${transactionId}] [SERVICE] pollInteraction - create poll Interaction for ${JSON.stringify(
        pollInteractionData,
      )}`,
    );

    const existingPollInteraction = await OBPollInteractionModel.findOne({
      pollId: pollInteractionData.pollId,
      pollType: pollInteractionData.pollType,
      'interactedUser.employeePsId': pollInteractionData.interactedUserPsId,
    });

    logInfo(
      `[${transactionId}] [SERVICE] pollInteraction - Poll interaction exists for pollId : ${pollInteractionData.pollId} , pollType : ${pollInteractionData.pollType} , interactionUserId : ${pollInteractionData.interactedUserPsId}`,
    );

    if (existingPollInteraction) {
      await existingPollInteraction.deleteOne();
    }

    await createPollInteraction(transactionId, mapPollInteractionToDBRecord(pollInteractionData));

    logInfo(`[${transactionId}] [SERVICE] pollInteraction - Poll interaction create successful`);

    return pollInteractionData.pollId;
  } catch (err) {
    logError(
      `[${transactionId}] [SERVICE] pollInteraction - ERROR creating poll interaction ${pollInteractionData.pollId}, reason: ${err.message}`,
    );

    throw err;
  }
};

const getPollData = async (
  transactionId: string,
  start: Date,
  end: Date,
  pollType?: string,
): Promise<OBPollSummaryDataType[]> => {
  logInfo(`[${transactionId}] [SERVICE] getPollData - Retrieving poll data, ${start}, ${end}`);

  try {
    const aggregationPipeline: PipelineStage[] = [
      {
        $match: {
          status: ActiveEnum.Enabled,
          isDeleted: false,
          createdAt: { $gte: start, $lte: end },
          ...(pollType ? { pollType } : { pollType: PollsEnum.Choice }),
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $unwind: '$branchIds',
      },
      {
        $group: {
          _id: '$branchIds',
          branchId: { $first: '$branchIds' },
          latestPoll: {
            $first: {
              pollId: '$pollId',
              title: '$title',
              createdAt: '$createdAt',
              pollType: '$pollType',
              pollOptions: '$pollOptions',
            },
          },
          interactions: {
            $push: '$pollId',
          },
        },
      },
      {
        $lookup: {
          from: MongoCollection.OneBayshorePollInteractionCollection,
          localField: 'latestPoll.pollId',
          foreignField: 'pollId',
          as: 'interactions',
        },
      },
      {
        $project: {
          branchId: '$_id',
          totalInteractions: { $size: '$interactions' },
          latestPoll: {
            pollId: '$latestPoll.pollId',
            title: '$latestPoll.title',
            createdAt: '$latestPoll.createdAt',
            pollType: '$latestPoll.pollType',
            options: {
              $cond: {
                if: { $eq: ['$latestPoll.pollType', 'Choice'] },
                then: {
                  $map: {
                    input: '$latestPoll.pollOptions',
                    as: 'option',
                    in: {
                      option: '$$option',
                      count: {
                        $size: {
                          $filter: {
                            input: '$interactions',
                            as: 'interaction',
                            cond: { $in: ['$$option', '$$interaction.selectionOptions'] },
                          },
                        },
                      },
                    },
                  },
                },
                else: null,
              },
            },
            numOfStars: {
              $cond: {
                if: { $eq: ['$latestPoll.pollType', 'Feedback'] },
                then: {
                  $map: {
                    input: [0, 1, 2, 3, 4, 5],
                    as: 'star',
                    in: {
                      rating: '$$star',
                      count: {
                        $size: {
                          $filter: {
                            input: '$interactions',
                            as: 'interaction',
                            cond: { $eq: ['$$interaction.numOfStars', '$$star'] },
                          },
                        },
                      },
                    },
                  },
                },
                else: null,
              },
            },
          },
        },
      },
    ];

    const aggregationResults = await OBPollModel.aggregate(aggregationPipeline);

    const result: OBPollSummaryDataType[] = aggregationResults.map((data) => ({
      branchId: data.branchId,
      totalInteractions: data.totalInteractions ?? 0,
      latestPoll: {
        pollId: data.latestPoll.pollId,
        title: data.latestPoll.title,
        createdAt: data.latestPoll.createdAt,
        pollType: data.latestPoll.pollType,
        options: data.latestPoll.options,
        numOfStars: data.latestPoll.numOfStars,
      },
    }));
    logInfo(`[${transactionId}] [SERVICE] getPollData - Successfully retrieved poll data: ${JSON.stringify(result)}`);

    return result;
  } catch (error) {
    logError(`[${transactionId}] [SERVICE] getPollData - FAILED due to error: ${error.message}`);
    throw error;
  }
};

export {
  createPoll,
  getPolls,
  updatePoll,
  getPollById,
  removePoll,
  createPollInteraction,
  pollInteraction,
  getPollInteractionsByPollId,
  getChoicePollInteractionsSummary,
  getPollInteractionByPollIdAndUserPsID,
  getPollData,
};
