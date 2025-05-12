import {
  HttpPutUpdateJobBoard,
  JobBoardPayloadType,
  OBBranchSchemaType,
  OBJobBoardOperationType,
  OBJobBoardSchemaType,
} from '../../types';

import { camelCaseToTitleCase, findDurationGap } from '../../utils';
const mapDbJobBoardToApiPayload = (
  jobBoardData: OBJobBoardSchemaType,
  branchData?: OBBranchSchemaType,
): JobBoardPayloadType => {
  const mappedJobBoard: Partial<JobBoardPayloadType> = {
    shiftStartsAt: jobBoardData.shiftStartsAt,
    shiftEndsAt: jobBoardData.shiftEndsAt,
    shiftDate: jobBoardData.shiftStartsAt,
    startTime: jobBoardData.shiftStartsAt.toLocaleTimeString(),
    endTime: jobBoardData.shiftEndsAt.toLocaleTimeString(),
    jobShiftId: jobBoardData.jobShiftId,
    priority: jobBoardData.priority,
    shiftStatus: jobBoardData.shiftStatus,
    shiftDetails: jobBoardData.shiftDetails,
    createdAt: jobBoardData.createdAt,
    updatedAt: jobBoardData.updatedAt,
  };

  if (branchData) {
    mappedJobBoard.branchId = branchData.branchId;
    mappedJobBoard.branchName = branchData.branchName;
  }

  if (jobBoardData.expiresAt) {
    mappedJobBoard.expiresAt = jobBoardData.expiresAt;
  }

  if (Array.isArray(jobBoardData?.shiftDetails) && jobBoardData?.shiftDetails.length > 0) {
    mappedJobBoard.shiftDetails = (jobBoardData?.shiftDetails || []).map((detail) => ({
      ...detail,
      field: detail.field ? camelCaseToTitleCase(detail.field) : detail.field,
    }));
  }

  if (jobBoardData.shiftEndsAt) {
    // Get the current date and time
    const currentDate = new Date();
    mappedJobBoard.expires = findDurationGap(currentDate, new Date(jobBoardData.shiftEndsAt));
  }

  if (jobBoardData.shiftAssignedToPsId) {
    mappedJobBoard.shiftAssignedToPsId = jobBoardData.shiftAssignedToPsId;
  }

  if (jobBoardData.createdUserPsId) {
    mappedJobBoard.createdUserPsId = jobBoardData.createdUserPsId;
  }

  return mappedJobBoard as JobBoardPayloadType;
};

const mapJobBoardApiRequestToServiceRequest = (jobBoard: HttpPutUpdateJobBoard): Partial<OBJobBoardOperationType> => {
  const mappedJobBoard: Partial<OBJobBoardOperationType> = {
    jobShiftId: jobBoard.jobShiftId,
  };

  if (jobBoard.shiftStartsAt) {
    mappedJobBoard.shiftStartsAt = new Date(jobBoard.shiftStartsAt);
  } else if (jobBoard.shiftDate && jobBoard.startTime) {
    mappedJobBoard.shiftStartsAt = new Date(
      new Date(jobBoard.shiftDate).toLocaleDateString() + ', ' + jobBoard.startTime,
    );
  }

  if (jobBoard.shiftEndsAt) {
    mappedJobBoard.shiftEndsAt = new Date(jobBoard.shiftEndsAt);
  } else if (jobBoard.shiftDate && jobBoard.endTime) {
    mappedJobBoard.shiftEndsAt = new Date(new Date(jobBoard.shiftDate).toLocaleDateString() + ', ' + jobBoard.endTime);
  }

  if (jobBoard.priority) {
    mappedJobBoard.priority = jobBoard.priority;
  }

  if (jobBoard.audienceLevel) {
    mappedJobBoard.audienceLevel = jobBoard.audienceLevel;
  }
  if (jobBoard.branchIds) {
    mappedJobBoard.branchIds = jobBoard.branchIds;
  }
  if (jobBoard.shiftStatus) {
    mappedJobBoard.shiftStatus = jobBoard.shiftStatus;
  }
  if (jobBoard.expiresAt) {
    mappedJobBoard.expiresAt = new Date(jobBoard.expiresAt);
  }

  if (jobBoard.shiftDetails) {
    mappedJobBoard.shiftDetails = jobBoard.shiftDetails;
  }

  if (jobBoard.shiftAssignedToPsId) {
    mappedJobBoard.shiftAssignedToPsId = jobBoard.shiftAssignedToPsId;
  }

  return mappedJobBoard;
};

export { mapDbJobBoardToApiPayload, mapJobBoardApiRequestToServiceRequest };
