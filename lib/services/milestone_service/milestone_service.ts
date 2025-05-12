import { FilterQuery } from 'mongoose';
import { notificationService } from '..';
import {
  ActiveStateEnum,
  AudienceEnum,
  MilestoneTypeEnum,
  NotificationOriginEnum,
  NotificationPlacementEnum,
  NotificationTypeEnum,
} from '../../enums';
import { logError, logInfo } from '../../log/util';
import { OBMilestoneModel, OBMilestoneInteractionModel } from '../../models';
import {
  OBMilestoneSchemaType,
  OBMilestoneOperationType,
  OBMilestoneInteractionSchemaType,
  OBMilestoneInteractionUpsertOperationType,
} from '../../types';
import { createNanoId, prefixMilestoneBatchId, prefixMilestoneId } from '../../utils';

const getMilestonesForBranchIds = async (
  transactionId: string,
  branchIds: string[] = [],
): Promise<{ branchId: string; milestones: OBMilestoneSchemaType[] }[]> => {
  if (!Array.isArray(branchIds) || branchIds.length === 0) {
    throw new Error('Missing mandatory field branchIds');
  }

  const today = new Date();
  const filters: FilterQuery<OBMilestoneSchemaType> = {
    $and: [
      {
        $or: [{ specificDate: today, approach: MilestoneTypeEnum.Specific }, { approach: MilestoneTypeEnum.Sequence }],
      },
      { $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $eq: null } }, { expiresAt: { $lte: today } }] },
    ],
    isDeleted: false,
    startDate: { $gte: today },
    status: ActiveStateEnum.Active,
    branchIds: { $in: branchIds },
  };

  logInfo(`[${transactionId}] [SERVICE] getMilestonesForBranchIds - Getting all Milestone`);

  try {
    const milestoneDbRecords = await OBMilestoneModel.find({ ...filters });

    const milestones = milestoneDbRecords.map((milestone) => milestone.toJSON());

    logInfo(
      `[${transactionId}] [SERVICE] getMilestonesForBranchIds - total milestones retrieved filters: ${JSON.stringify(
        filters,
      )}`,
    );

    const formattedMilestones: { branchId: string; milestones: OBMilestoneSchemaType[] }[] = branchIds.map(
      (branchId: string) => ({
        branchId,
        milestones: milestones.filter((milestone: OBMilestoneSchemaType) => milestone.branchIds.includes(branchId)),
      }),
    );

    logInfo(
      `[${transactionId}] [SERVICE] getMilestonesForBranchIds - SUCCESSFULLY retrieved: ${formattedMilestones.length} Milestone groups`,
    );

    return formattedMilestones;
  } catch (listErr) {
    logError(`[${transactionId}] [SERVICE] getMilestonesForBranchIds - FAILED, reason: ${listErr.message}`);

    throw listErr;
  }
};
const createMilestones = async (transactionId: string, milestones: OBMilestoneOperationType): Promise<string> => {
  logInfo(`[${transactionId}] [SERVICE] createMilestones - Creating milestones`);

  try {
    // Create a common batch id
    if (milestones.milestoneTasks.length === 0) {
      throw new Error('The mandatory field "milestones" is missing or empty');
    }

    if (!milestones.batchId) {
      const id = createNanoId(5);
      milestones.batchId = prefixMilestoneBatchId(id);
    }
    // Validate the data in each milestone
    validateMilestones(milestones);

    // Create independent milestoneId for each task
    const updatedMilestones = milestones.milestoneTasks.map((milestone) => ({
      ...milestone,
      batchId: milestones.batchId,
      milestoneId: generateMilestoneId(),
    }));

    // Create the records in the db
    const createdMilestones = await OBMilestoneModel.insertMany(updatedMilestones);
    const [createdData] = createdMilestones;
    logInfo(`[${transactionId}] [SERVICE] createMilestones - SUCCESSFUL for batchId: ${milestones.batchId}`);

    return createdData.batchId;
  } catch (createErr) {
    logError(`[${transactionId}] [SERVICE] createMilestones - FAILED, reason: ${createErr.message}`);

    throw createErr;
  }
};

const validateMilestones = (milestones: OBMilestoneOperationType): void => {
  milestones.milestoneTasks.map((milestone) => {
    if (!milestone.audienceLevel || typeof milestone.audienceLevel !== 'string') {
      throw new Error('Each milestone must have a valid audienceLevel.');
    }
    if (!milestone.milestoneTitle || typeof milestone.milestoneTitle !== 'string') {
      throw new Error('Each milestone must have a valid milestoneTitle.');
    }
    if (!(milestone.branchIds?.length > 0) && !(milestone.userPsIds?.length > 0)) {
      throw new Error('Each milestone must have a valid branchIds/userPsIds.');
    }
    if (!milestone.milestoneDescription || typeof milestone.milestoneDescription !== 'string') {
      throw new Error('Each milestone must have a valid milestoneDescription.');
    }
    if (!milestone.approach || typeof milestone.approach !== 'string') {
      throw new Error('Each milestone must have a valid approach.');
    }
    if (!milestone.priority || typeof milestone.priority !== 'string') {
      throw new Error('Each milestone must have a valid priority.');
    }
  });
};
const generateMilestoneId = (): string => {
  const id = createNanoId(5);

  return prefixMilestoneId(id);
};

async function createMilestoneInteractions(
  transactionId: string,
  interactions: OBMilestoneInteractionUpsertOperationType[],
): Promise<OBMilestoneInteractionSchemaType[]> {
  logInfo(`[${transactionId}] [SERVICE] createMilestoneInteractions - Creating milestone interactions`);

  if (interactions?.length === 0) {
    throw new Error('The mandatory field "interactions" is missing or empty');
  }

  const validInteractions = interactions.filter(({ batchId, employeePsId, milestoneId }) => {
    if (!batchId || !employeePsId || !milestoneId) {
      logError(
        `[${transactionId}] [SERVICE] createMilestoneInteractions - Skipping interaction due to missing fields:${JSON.stringify(
          {
            batchId,
            employeePsId,
            milestoneId,
          },
        )}`,
      );

      return false;
    }

    return true;
  });

  if (validInteractions.length === 0) {
    throw new Error('No valid interactions found to create milestones');
  }

  try {
    const interactionsResult = await OBMilestoneInteractionModel.insertMany(validInteractions);
    logInfo(
      `[${transactionId}] [SERVICE] createMilestoneInteractions - Successfully created ${validInteractions.length} interactions`,
    );

    return interactionsResult;
  } catch (err) {
    logError(`[${transactionId}] [SERVICE] createMilestoneInteractions - FAILED, reason: ${err.message}`);
    throw err;
  }
}

const getPreviousMilestoneInteractions = async (
  transactionId: string,
  filters: { employeePsId: string; milestoneId: string; batchId: string }[],
): Promise<OBMilestoneInteractionSchemaType[]> => {
  logInfo(
    `[${transactionId}] [SERVICE] getPreviousMilestoneInteractions - Querying for previous milestone interactions`,
  );

  if (!Array.isArray(filters) || filters.length === 0) {
    throw new Error('The mandatory field filters are missing');
  }

  // If any of these fields (employeePsId, milestoneId, or batchId) is missing, then skip that filter
  const sanitizedFilters = filters.filter(
    ({ employeePsId, milestoneId, batchId }) => employeePsId && milestoneId && batchId,
  );

  try {
    const interactionDbRecords = await OBMilestoneInteractionModel.find({ $or: sanitizedFilters });

    const previousMilestoneInteractions = interactionDbRecords.map((interaction) => interaction.toJSON());

    logInfo(
      `[${transactionId}] [SERVICE] getPreviousMilestoneInteractions - Successfully retrieved ${previousMilestoneInteractions.length} interactions`,
    );

    return previousMilestoneInteractions;
  } catch (err) {
    logError(`[${transactionId}] [SERVICE] getPreviousMilestoneInteractions - FAILED, reason: ${err.message}`);
    throw err;
  }
};

const getMilestonesByFilters = async (
  transactionId: string,
  filters?: FilterQuery<OBMilestoneSchemaType>,
): Promise<OBMilestoneSchemaType[]> => {
  logInfo(`[${transactionId}] [SERVICE] getMilestonesByFilters - find all milestones by filters`);

  try {
    const milestoneDbRecords = await OBMilestoneModel.find({ ...filters });

    const milestones = milestoneDbRecords.map((milestone) => milestone.toJSON());

    logInfo(
      `[${transactionId}] [SERVICE] getMilestonesByFilters - total milestones retrieved filters: ${JSON.stringify(
        filters,
      )}`,
    );
    logInfo(
      `[${transactionId}] [SERVICE] getMilestonesByFilters - SUCCESSFULLY retrieved: ${milestones.length} Milestone`,
    );

    return milestones;
  } catch (listErr) {
    logError(`[${transactionId}] [SERVICE] getMilestonesByFilters - FAILED, reason: ${listErr.message}`);

    throw listErr;
  }
};

const notifyMilestonePrerequisites = async (transactionId: string): Promise<void> => {
  logInfo(`[${transactionId}] [SERVICE] notifyMilestonePrerequisites - Processing`);

  try {
    const today = new Date();

    const filters = {
      startDate: { $lte: today },
      isDeleted: false,
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: { $gte: today } },
        { specificDate: { $exists: false } },
        { specificDate: today },
      ],
      // TODO logic needed for dayGapForNotification and user-specific calculations
    };

    const milestones = await getMilestonesByFilters(transactionId, filters);
    // TODO: We need Verify previous interactions.

    for (const milestone of milestones) {
      const notification = {
        priority: milestone.priority,
        expiresAt: milestone.expiresAt,
        notificationPlacements: [NotificationPlacementEnum.Prerequisite],
        notificationOrigin: NotificationOriginEnum.System,
        notificationType: NotificationTypeEnum.Individual,
        notificationVisibility: AudienceEnum.Individual,
        notificationTitle: milestone.milestoneTitle,
        notificationBody: milestone.milestoneDescription,
        userPsIds: milestone.userPsIds,
        branchIds: milestone.branchIds,
        audienceLevel: milestone.audienceLevel,
      };

      await notificationService.sendNotification(transactionId, notification);
    }

    logInfo(
      `[${transactionId}] [SERVICE] notifyMilestonePrerequisites - Completed with ${milestones.length} eligible milestones`,
    );
  } catch (listErr) {
    logError(`[${transactionId}] [SERVICE] notifyMilestonePrerequisites - FAILED, reason: ${listErr.message}`);
    throw listErr;
  }
};

export {
  getMilestonesForBranchIds,
  getPreviousMilestoneInteractions,
  createMilestones,
  createMilestoneInteractions,
  getMilestonesByFilters,
  notifyMilestonePrerequisites,
};
