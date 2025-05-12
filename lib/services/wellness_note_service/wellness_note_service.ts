import { FilterQuery, QueryOptions, PipelineStage } from 'mongoose';
import { logError, logInfo, logWarn } from '../../log/util';
import { OBWellnessNoteModel } from '../../models';
import { clientService } from '../../services';
import { OBWellnessNoteSchemaType, OBWellnessNoteUpsertOperationType, OBWellnessNoteDataType } from '../../types';
import { createNanoId, prefixWellnessNoteId } from '../../utils';

// Function to create a wellness note
const createWellnessNote = async (
  transactionId: string,
  wellnessNote: OBWellnessNoteUpsertOperationType,
): Promise<OBWellnessNoteSchemaType> => {
  logInfo(`[${transactionId}] [SERVICE] createWellnessNote initiated`);

  try {
    // Check if all mandatory fields are present
    const { branchId, cvid, employeePsId, employeeName, note, visitId } = wellnessNote;

    if (!branchId || !cvid || !employeePsId || !employeeName || !note || !visitId) {
      throw new Error('Missing mandatory fields for creating a wellness note');
    }

    const nanoId = createNanoId(8);
    wellnessNote.noteId = prefixWellnessNoteId(nanoId);

    if (!wellnessNote.clientDisplayName) {
      const [matchingClient] = await clientService.getClientDetailByClientAndTenantIds(transactionId, [
        {
          clientId: wellnessNote.clientId,
          tenantId: wellnessNote.tenantId,
        },
      ]);

      wellnessNote.clientDisplayName = '-';

      if (matchingClient?.firstName && matchingClient?.lastName) {
        wellnessNote.clientDisplayName = `${matchingClient.firstName} ${matchingClient.lastName.slice(0, 1)}`;
      }
    }

    // Create a new instance of the OBWellnessNoteModel and save it
    const newObWellnessNote = await new OBWellnessNoteModel(wellnessNote).save();

    logInfo(`[${transactionId}] [SERVICE] createWellnessNote SUCCESSFUL`);

    return newObWellnessNote;
  } catch (createErr) {
    logError(`[${transactionId}] [SERVICE] createWellnessNote FAILED. Reason: ${createErr.message}`);

    // throw createErr;
  }
};

// Function to update a wellness note
const updateWellnessNote = async (
  transactionId: string,
  wellnessNote: Partial<OBWellnessNoteUpsertOperationType>,
): Promise<string> => {
  const { noteId, branchId } = wellnessNote;
  try {
    logInfo(
      `[${transactionId}] [SERVICE] updateWellnessNote - Update record initiated for noteId: ${noteId} & branchId:${branchId}`,
    );

    // Find and update the wellness note using noteId
    await OBWellnessNoteModel.findOneAndUpdate({ noteId }, { ...wellnessNote, updatedAt: new Date() }, { new: true });

    logInfo(`[${transactionId}] [SERVICE] updateWellnessNote - Update record SUCCESSFUL for noteId: ${noteId}`);

    return noteId;
  } catch (updateErr) {
    logError(
      `[${transactionId}] [SERVICE] updateWellnessNote - ERROR updating the wellness note for noteId ${noteId}. Reason: ${updateErr.message}`,
    );

    throw updateErr;
  }
};

// Function to retrieve wellness notes based on branch IDs, search query, pagination, and sorting
const getWellnessNotesByBranchIds = async (
  transactionId: string,
  branchIds: string[],
  options?: {
    limit?: number;
    skip?: number;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
    search?: string;
  },
): Promise<OBWellnessNoteSchemaType[]> => {
  logInfo(
    `[${transactionId}] [SERVICE] getWellnessNotesByBranchIds - Retrieving wellness notes for branch IDs: ${branchIds}`,
  );

  const searchQuery: FilterQuery<OBWellnessNoteSchemaType> = options?.search
    ? {
        $or: [
          { cvid: new RegExp(options.search, 'i') },
          { clientDisplayName: new RegExp(options.search, 'i') },
          { branchId: new RegExp(options.search, 'i') },
          { note: new RegExp(options.search, 'i') },
          { employeeName: new RegExp(options.search, 'i') },
        ],
      }
    : {};

  const sortQuery: QueryOptions<OBWellnessNoteSchemaType> = {};
  if (options && options.sortField) {
    sortQuery[options.sortField] = options.sortOrder === 'asc' ? 1 : -1;
  } else {
    sortQuery.checkoutAt = -1; // Default sort by checkoutAt in descending order
  }

  const limit = options?.limit ?? 10;
  const skip = options?.skip ?? 0;

  const wellnessNotes = await OBWellnessNoteModel.find({ branchId: { $in: branchIds }, ...searchQuery })
    .sort(sortQuery)
    .skip(skip)
    .limit(limit)
    .lean();

  logInfo(`[${transactionId}] [SERVICE] getWellnessNotesByBranchIds - Successfully retrieved wellness notes`);

  return wellnessNotes;
};

const getWellnessNotes = async (transactionId: string, start: Date, end: Date): Promise<OBWellnessNoteDataType[]> => {
  logInfo(`[${transactionId}] [SERVICE] getWellnessNotes - Retrieving wellness notes from ${start} to ${end}`);

  try {
    const aggregationPipeline: PipelineStage[] = [
      {
        $sort: {
          createdAt: -1,
        },
      },
      {
        $unwind: '$branchId',
      },
      {
        $group: {
          _id: '$branchId',
          branchId: { $first: '$branchId' },
          wellnessNotes: {
            $push: {
              cvid: '$cvid',
              clientDisplayName: '$clientDisplayName',
              employeeName: '$employeeName',
              visitDate: '$checkoutAt',
              wellnessNote: '$note',
              branch: '$branchId',
              createdAt: '$createdAt',
            },
          },
        },
      },
      {
        $project: {
          branchId: '$_id',
          wellnessNotes: {
            $slice: ['$wellnessNotes', 5],
          },
        },
      },
    ];

    const aggregationResults: OBWellnessNoteDataType[] = await OBWellnessNoteModel.aggregate(aggregationPipeline);

    if (aggregationResults.length > 0) {
      logInfo(`[${transactionId}] [SERVICE] getWellnessNotes - Successfully retrieved wellness notes`);

      return aggregationResults.map((data) => ({
        branchId: data.branchId,
        wellnessNotes: data.wellnessNotes,
      }));
    } else {
      logWarn(`[${transactionId}] [SERVICE] getWellnessNotes - No wellness notes found for provided criteria`);

      return [];
    }
  } catch (error) {
    logError(`[${transactionId}] [SERVICE] getWellnessNotes - FAILED due to error: ${error.message}`);
    throw error;
  }
};

export { createWellnessNote, updateWellnessNote, getWellnessNotesByBranchIds, getWellnessNotes };
