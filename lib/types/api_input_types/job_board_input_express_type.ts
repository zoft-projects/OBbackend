import { ActiveStateEnum, AudienceEnum, PriorityEnum } from '../../enums';

type HTTPJobBoardInputType = {
  shiftDate: string;
  startTime: string;
  endTime: string;
  shiftStartsAt?: string;
  shiftEndsAt?: string;
  priority: PriorityEnum;
  audienceLevel: AudienceEnum;
  branchIds?: string[];
  shiftStatus: ActiveStateEnum;
  shiftDetails: {
    field: string;
    value: string;
    order: number;
  }[];
  expiresAt?: string;
  shiftAssignedToPsId?: string;
  createdUserPsId: string;
};

type HttpPutUpdateJobBoard = {
  jobShiftId: string;
  shiftStartsAt?: string;
  shiftEndsAt?: string;
  shiftDate?: string;
  startTime?: string;
  endTime?: string;
  priority?: PriorityEnum;
  audienceLevel?: AudienceEnum;
  branchIds?: string[];
  shiftStatus?: ActiveStateEnum;
  shiftDetails?: {
    field: string;
    value: string;
    order: number;
  }[];
  expiresAt?: string;
  shiftAssignedToPsId?: string;
  isDeleted?: boolean;
};

type HttpPutJobBoardSyncAudienceInfo = {
  audienceLevel: AudienceEnum;
  branchIds?: string[];
  divisionIds?: string[];
};

export { HTTPJobBoardInputType, HttpPutUpdateJobBoard, HttpPutJobBoardSyncAudienceInfo };
