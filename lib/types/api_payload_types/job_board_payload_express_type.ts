import { PriorityEnum } from '../../enums';

type JobBoardPayloadType = {
  shiftStartsAt?: Date;
  shiftEndsAt?: Date;
  shiftDate: Date;
  startTime: string;
  endTime: string;
  priority: PriorityEnum;
  jobShiftId: string;
  branchId?: string;
  branchName?: string;
  shiftStatus: string;
  shiftDetails: {
    field: string;
    value: string;
    order: number;
  }[];
  expiresAt?: Date;
  expires?: string;
  shiftAssignedToPsId?: string;
  createdUserPsId: string;
  createdAt: Date;
  updatedAt: Date;
};

export { JobBoardPayloadType };
