/* eslint-disable @typescript-eslint/no-unused-vars */
import config from 'config';
import { FilterQuery, QueryOptions } from 'mongoose';
import { ActiveStateEnum, AudienceEnum, PriorityEnum } from '../../enums';
import { logInfo, logError } from '../../log/util';
import { OBJobBoardModel } from '../../models';
import { HttpPutJobBoardSyncAudienceInfo, OBJobBoardOperationType, OBJobBoardSchemaType } from '../../types';
import { addDays, convertExcelSerialDateToJSDate, createNanoId, prefixJobShifts, formatDate } from '../../utils';
import { getSecret } from '../../vendors';
import { getMicrosoftGraphAccessToken, getSharePointFile } from '../../vendors/microsoft-graph/microsoft-graph';
/* eslint-enable @typescript-eslint/no-unused-vars */

const areValidJobBoard = (jobShifts: OBJobBoardOperationType[]) => {
  const invalidShifts = jobShifts.filter((shift) => {
    if (
      !shift.createdUserPsId ||
      !shift.shiftStartsAt ||
      !shift.priority ||
      !shift.shiftEndsAt ||
      !(shift.shiftDetails?.length > 0) ||
      !shift.shiftStatus
    ) {
      return true;
    }

    const invalidShiftDetails = shift.shiftDetails?.filter(
      (shiftDetail) => !shiftDetail.field || !shiftDetail.value || !shiftDetail.order,
    );

    if (invalidShiftDetails?.length > 0) {
      return true;
    }

    return false;
  });

  if (invalidShifts.length > 0) {
    return false;
  }

  return true;
};

const createJobBoard = async (txId: string, jobShiftsData: OBJobBoardSchemaType): Promise<string> => {
  try {
    logInfo(
      `[${txId}] [SERVICE] createJobBoardDB - Creating job shifts with the data ${JSON.stringify(jobShiftsData)}`,
    );

    const createdJobShift = await new OBJobBoardModel(jobShiftsData).save();

    logInfo(`[${txId}] [SERVICE] createJobBoardDB - Job Shifts created successfully`);

    return createdJobShift.jobShiftId;
  } catch (err) {
    logError(`[${txId}] [SERVICE] createJobBoardDB - Job Shifts create failed with error ${err?.message}`);

    throw err;
  }
};

const createMultipleJobBoard = async (
  txId: string,
  jobShiftsInsertData: OBJobBoardOperationType[],
): Promise<{
  successful: string[];
  failed: string[];
  createdJobShifts: OBJobBoardSchemaType[];
}> => {
  try {
    logInfo(`[${txId}] [SERVICE] createMultipleJobBoard - Create job shifts initiated`);

    const isValid = areValidJobBoard(jobShiftsInsertData);

    if (!isValid) {
      logError(`[${txId}] [SERVICE] createMultipleJobBoard - Job shifts data is invalid`);

      throw new Error('Invalid fields');
    }

    logInfo(`[${txId}] [SERVICE] createMultipleJobBoard - Job shifts data is valid`);

    const jobShiftsBranchList = [];

    jobShiftsInsertData.map((shift) => {
      shift.branchIds.map((branchId) => {
        jobShiftsBranchList.push({
          ...shift,
          branchIds: [branchId],
        });
      });
    });

    const jobShiftsData = jobShiftsBranchList.map((shift) => {
      const nanoId = createNanoId(5);

      return {
        ...shift,
        updatedAt: new Date(),
        createdAt: new Date(),
        jobShiftId: prefixJobShifts(nanoId),
      };
    });

    logInfo(`[${txId}] [SERVICE] createMultipleJobBoard - Job shifts assigned with jobShifts Id`);

    const taskArray = jobShiftsData.map((jobShift) => createJobBoard(txId, jobShift));

    const taskResults: PromiseSettledResult<string>[] = await Promise.allSettled(taskArray);

    const stats = {
      successful: new Set<string>(),
      failed: new Set<string>(),
    };

    taskResults.forEach((result) => {
      if (result.status === 'rejected') {
        logError(`[${txId}] [Service] [createMultipleJobBoard] Error writing to mongo, reason: ${result.reason}`);

        return;
      }

      stats.successful.add(result.value);
    });

    jobShiftsData.map((shifts) => {
      if (!stats.successful.has(shifts.jobShiftId)) {
        stats.failed.add(shifts.jobShiftId);
      }
    });

    return {
      successful: [...stats.successful],
      failed: [...stats.failed],
      createdJobShifts: jobShiftsData,
    };
  } catch (createErr) {
    logError(
      `[${txId}] [SERVICE] createMultipleJobBoard - ERROR creating job shifts ${JSON.stringify(
        jobShiftsInsertData,
      )}, reason: ${createErr.message}`,
    );
    throw createErr;
  }
};

const getAllJobBoards = async (
  transactionId: string,
  userDetails: { userPsId: string; branchIds: string[]; divisionIds: string[]; provincialCodes: string[] },
  filters: FilterQuery<OBJobBoardSchemaType>,
  options?: QueryOptions<OBJobBoardSchemaType>,
): Promise<OBJobBoardSchemaType[]> => {
  logInfo(
    `[${transactionId}] [SERVICE] getJobShiftsByFilter - find all JobShifts by filters: ${JSON.stringify(
      filters,
    )}, options: ${JSON.stringify(options)}`,
  );

  try {
    const jobShiftsQueryCursor = OBJobBoardModel.find(filters, {}, options).cursor();

    const jobShifts: OBJobBoardSchemaType[] = [];

    for await (const jobShift of jobShiftsQueryCursor) {
      jobShifts.push(jobShift.toJSON());
    }

    const filteredJobShifts: OBJobBoardSchemaType[] = [];

    jobShifts.forEach((jobShift) => {
      switch (true) {
        case jobShift.audienceLevel === AudienceEnum.National:
        case userDetails.branchIds.includes('*') ||
          (jobShift.audienceLevel === AudienceEnum.Branch &&
            jobShift.branchIds.some((id) => userDetails.branchIds.includes(id))):
        case userDetails.divisionIds.includes('*') ||
          (jobShift.audienceLevel === AudienceEnum.Division &&
            jobShift.divisionIds.some((id) => userDetails.divisionIds.includes(id))):
        case userDetails.provincialCodes.includes('*') ||
          (jobShift.audienceLevel === AudienceEnum.Province &&
            jobShift.provincialCodes.some((id) => userDetails.provincialCodes.includes(id))):
          // In all of the above cases add the jobShift
          filteredJobShifts.push({
            ...jobShift,
            shiftStartsAt: new Date(jobShift.shiftStartsAt),
          });
          break;
        default:
      }
    });

    logInfo(
      `[${transactionId}] [SERVICE] getJobShiftsByFilter - total JobShifts retrieved filters: ${JSON.stringify(
        filters,
      )}`,
    );

    return filteredJobShifts;
  } catch (listErr) {
    logError(`[${transactionId}] [SERVICE] getJobShiftsByFilter - FAILED,  reason: ${listErr.message}`);
    throw listErr;
  }
};

const updateJobBoard = async (
  transactionId: string,
  jobShiftPartialFields: Partial<OBJobBoardSchemaType>,
): Promise<string> => {
  logInfo(
    `[${transactionId}] [SERVICE] updateJobBoard - updating job shifts for jobShiftId: ${jobShiftPartialFields.jobShiftId}`,
  );

  try {
    if (!jobShiftPartialFields.jobShiftId) {
      throw new Error('Missing mandatory field jobShiftId for update');
    }

    const updatedJobShift = await OBJobBoardModel.findOneAndUpdate(
      {
        jobShiftId: jobShiftPartialFields.jobShiftId,
      },
      {
        ...jobShiftPartialFields,
        updatedAt: new Date(),
      },
      {
        new: true,
      },
    );

    logInfo(`[${transactionId}] [SERVICE] updateJobBoard - SUCCESSFUL for jobShiftId: ${updatedJobShift.jobShiftId}`);

    return updatedJobShift.jobShiftId;
  } catch (updateErr) {
    logError(
      `[${transactionId}] [SERVICE] updateJobBoard - FAILED for jobShiftId: ${jobShiftPartialFields.jobShiftId}, reason: ${updateErr.message}`,
    );

    throw updateErr;
  }
};

const updateMultipleJobBoards = async (
  transactionId: string,
  jobShifts: Partial<OBJobBoardOperationType>[],
): Promise<{
  successful: string[];
  failed: string[];
}> => {
  try {
    logInfo(`[${transactionId}] [SERVICE] updateMultipleJobBoards - Update job shifts initiated`);

    const isValid = jobShifts.filter((jobShift) => !jobShift.jobShiftId);

    if (!isValid) {
      logError(`[${transactionId}] [SERVICE] updateMultipleJobBoards - Job shifts missing job shift Id`);

      throw new Error('Job shifts missing job shift Id');
    }

    logInfo(`[${transactionId}] [SERVICE] updateMultipleJobBoards - Job shifts data is valid`);

    const taskArray = jobShifts.map((jobShift) => updateJobBoard(transactionId, jobShift));

    const taskResults: PromiseSettledResult<string>[] = await Promise.allSettled(taskArray);

    const stats = {
      successful: new Set<string>(),
      failed: new Set<string>(),
    };

    taskResults.forEach((result) => {
      if (result.status === 'rejected') {
        logError(
          `[${transactionId}] [Service] [updateMultipleJobBoards] Error writing to mongo, reason: ${result.reason}`,
        );

        return;
      }

      stats.successful.add(result.value);
    });

    jobShifts.map((shifts) => {
      if (!stats.successful.has(shifts.jobShiftId)) {
        stats.failed.add(shifts.jobShiftId);
      }
    });

    return {
      successful: [...stats.successful],
      failed: [...stats.failed],
    };
  } catch (updateErr) {
    logError(`[${transactionId}] [SERVICE] updateMultipleJobBoards - FAILED for reason: ${updateErr.message}`);

    throw updateErr;
  }
};

// TODO: in the future, if more businesses end up using the Sharepoint feature, modify syncWithICSMasterTrackerSheet to generalize to more businesses other than just ICS
const syncWithICSMasterTrackerSheet = async (
  transactionId: string,
  syncAudienceInfo: HttpPutJobBoardSyncAudienceInfo,
): Promise<void> => {
  /* 
  This function does the following steps to sync OBS DB with ICS Master Tracker Sheet
    1. Pull all the relevant data from ICS Master Tracker Sheet
    2. Check which shifts in the ICS Master Tracker Sheet should be soft deleted in OBS DB, and which ones should be added/updated in OBS DB
    3. Soft delete all the delete-able shifts in OBS DB
    4. Add/update in OBS DB all the shifts that are currently relevant
   */
  logInfo(`[${transactionId}] [SERVICE] syncWithICSMasterTrackerSheet - INITIATED`);

  try {
    /* Step 1 */
    const { secretKeyName }: { secretKeyName: string } = config.get('Services.IcsTaMasterTracker');
    const [clientId, clientSecret, tenantId, icsMasterTrackerSheetURLPath] = (await getSecret(secretKeyName)).split(
      '|',
    );

    const icsAccessToken = await getMicrosoftGraphAccessToken(clientId, clientSecret, tenantId, transactionId);

    const ICSMasterTrackerAllTAsWorksheet = await getSharePointFile(
      icsAccessToken,
      icsMasterTrackerSheetURLPath,
      transactionId,
    );

    const worksheetHeaderRow = ICSMasterTrackerAllTAsWorksheet[1];

    const dueDateColumn = worksheetHeaderRow.indexOf('Due Date');
    const communityColumn = worksheetHeaderRow.indexOf('Community');
    const startDateColumn = worksheetHeaderRow.indexOf('Start Date');
    const endDateColumn = worksheetHeaderRow.indexOf('End Date');
    const fillLabelColumn = worksheetHeaderRow.indexOf('Fill Label');

    logInfo(
      `[${transactionId}] [SERVICE] syncWithICSMasterTrackerSheet - ICSMasterTrackerSheet received with headers row: ${worksheetHeaderRow}`,
    );

    const idToDataMapForCurrentJobShifts = new Map<string, { nursesNeeded: number; dueDate: Date }>();

    const fiveDaysFromNow = addDays(new Date(), 5);

    /* Step 2  */
    for (let row = 2; row < ICSMasterTrackerAllTAsWorksheet.length; row++) {
      const endDateStandardFormat = convertExcelSerialDateToJSDate(
        +ICSMasterTrackerAllTAsWorksheet[row][endDateColumn],
      );
      if (
        ['Unfilled', 'Declined'].includes(ICSMasterTrackerAllTAsWorksheet[row][fillLabelColumn] as string) &&
        endDateStandardFormat > fiveDaysFromNow
      ) {
        const jobShiftId = // In the ICSMasterTrackerAllTAsWorksheet, every unique job offer can be distinguished using the 3 columns used for jobShiftId here
          ICSMasterTrackerAllTAsWorksheet[row][communityColumn] +
          '_' +
          ICSMasterTrackerAllTAsWorksheet[row][startDateColumn] +
          '_' +
          ICSMasterTrackerAllTAsWorksheet[row][endDateColumn];

        const dueDate = convertExcelSerialDateToJSDate(+ICSMasterTrackerAllTAsWorksheet[row][dueDateColumn], true);

        if (idToDataMapForCurrentJobShifts.has(jobShiftId)) {
          const previouslySetNursesNeeded = idToDataMapForCurrentJobShifts.get(jobShiftId).nursesNeeded;
          const previouslySetDueDate = idToDataMapForCurrentJobShifts.get(jobShiftId).dueDate;

          idToDataMapForCurrentJobShifts.set(jobShiftId, {
            nursesNeeded: previouslySetNursesNeeded + 1,
            dueDate: previouslySetDueDate > dueDate ? previouslySetDueDate : dueDate,
          });
        } else {
          idToDataMapForCurrentJobShifts.set(jobShiftId, { nursesNeeded: 1, dueDate });
        }
      }
    }

    const currentJobShiftIds = Array.from(idToDataMapForCurrentJobShifts.keys());

    logInfo(
      `[${transactionId}] [SERVICE] syncWithICSMasterTrackerSheet - ${currentJobShiftIds.length} unique current job shift offers identified from ICSMasterTrackerSheet`,
    );
    /* Step 3  */
    const { modifiedCount } = await OBJobBoardModel.updateMany(
      { $and: [{ isDeleted: false }, { jobShiftId: { $nin: currentJobShiftIds } }] },
      { isDeleted: true, updatedAt: Date.now() },
    );

    logInfo(
      `[${transactionId}] [SERVICE] syncWithICSMasterTrackerSheet - ${modifiedCount} expired/invalid job shift offers soft deleted from Mongo.`,
    );

    /*  Step 4   */
    const { audienceLevel, branchIds, divisionIds } = syncAudienceInfo;

    if (
      (audienceLevel === AudienceEnum.Branch && (!branchIds || (Array.isArray(branchIds) && branchIds.length === 0))) ||
      (audienceLevel === AudienceEnum.Division &&
        (!divisionIds || (Array.isArray(divisionIds) && divisionIds.length === 0)))
    ) {
      throw new Error('Audience level is not compatible with the branchIds or divisionIds provided');
    }

    const updateResults = await Promise.allSettled(
      currentJobShiftIds.map((jobShiftId) => {
        const [community, startTimeExcelSerialFormat, endTimeExcelSerialFormat] = jobShiftId.split('_');

        const shiftStartsAt = convertExcelSerialDateToJSDate(+startTimeExcelSerialFormat);
        const shiftEndsAt = convertExcelSerialDateToJSDate(+endTimeExcelSerialFormat);

        const upsertPayload: Partial<OBJobBoardSchemaType> = {
          shiftStartsAt,
          shiftEndsAt,
          audienceLevel,
          jobShiftId,
          priority: PriorityEnum.Medium,
          shiftStatus: ActiveStateEnum.Active,
          shiftDetails: [
            {
              field: 'dueDate',
              value: formatDate(idToDataMapForCurrentJobShifts.get(jobShiftId).dueDate.toISOString(), 'MMM dd, yyyy'),
              order: 1,
            },
            { field: 'community', value: community, order: 2 },
            {
              field: 'nursesRequired',
              value: idToDataMapForCurrentJobShifts.get(jobShiftId).nursesNeeded.toString(),
              order: 3,
            },
          ],
          updatedAt: new Date(),
        };

        if (audienceLevel === AudienceEnum.Branch) {
          upsertPayload.branchIds = branchIds;
        } else if (audienceLevel === AudienceEnum.Division) {
          upsertPayload.divisionIds = divisionIds;
        }

        return OBJobBoardModel.findOneAndUpdate({ jobShiftId }, upsertPayload, { upsert: true, new: true });
      }),
    );

    const unsuccessfulUpdates = updateResults.filter((updateResult) => updateResult.status === 'rejected');
    logInfo(
      `[${transactionId}] [SERVICE] syncWithICSMasterTrackerSheet - SUCCESSFULLY completed. ${unsuccessfulUpdates.length} records were unsuccessfully updated`,
    );
  } catch (syncErr) {
    logError(`[${transactionId}] [SERVICE] syncWithICSMasterTrackerSheet - FAILED , reason: ${syncErr.message}`);

    throw syncErr;
  }
};
export { createMultipleJobBoard, getAllJobBoards, updateMultipleJobBoards, syncWithICSMasterTrackerSheet };
