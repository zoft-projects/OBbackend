import { ActiveStateEnum, AudienceEnum, PriorityEnum } from '../../enums';

type OBBoardDetails = {
  field: string;
  value: string;
  order: number;
};

type OBJobBoardOperationType = {
  jobShiftId?: string;
  shiftStartsAt: Date;
  shiftEndsAt: Date;
  expiresAt?: Date;
  priority: PriorityEnum;
  audienceLevel: AudienceEnum;
  branchIds?: string[];
  shiftStatus: ActiveStateEnum;
  shiftDetails: OBBoardDetails[];
  shiftAssignedToPsId?: string;
  createdUserPsId?: string;
  isDeleted?: boolean;
};

export { OBJobBoardOperationType, OBBoardDetails };
