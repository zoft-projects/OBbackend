import { ActiveStateEnum, AudienceEnum, PriorityEnum, ProvincialCodesEnum } from '../../enums';

type OBJobBoardDetailsType = {
  field: string;
  value: string;
  order: number;
};

type OBJobBoardSchemaType = {
  id?: string;
  shiftStartsAt: Date;
  shiftEndsAt: Date;
  audienceLevel: AudienceEnum;
  branchIds?: string[];
  provincialCodes?: ProvincialCodesEnum[];
  divisionIds?: string[];
  expiresAt?: Date;
  jobShiftId: string;
  priority: PriorityEnum;
  shiftStatus: ActiveStateEnum;
  shiftDetails: OBJobBoardDetailsType[];
  shiftAssignedToPsId?: string;
  createdUserPsId?: string;
  isDeleted?: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export { OBJobBoardSchemaType, OBJobBoardDetailsType };
