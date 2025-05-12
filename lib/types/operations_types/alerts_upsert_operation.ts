import { ProvincialCodesEnum, PriorityEnum } from '../../enums';

type OBAlertUpsertOperationType = {
  alertId?: string;
  title: string;
  description: string;
  audienceLevel: string;
  branchIds?: string[];
  provincialCodes?: ProvincialCodesEnum[];
  divisionIds?: string[];
  accessLevelNames: string[];
  status: string;
  priority?: PriorityEnum;
  validFrom?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  createdBy: {
    employeePsId: string;
    displayName?: string;
    userImageLink?: string;
  };
};

type OBAlertInteractionOperationType = {
  alertId?: string;
  interactionType: string;
  interactedUserPsId: string;
  interactedUserName?: string;
  interactedUserImage?: string;
};

export { OBAlertUpsertOperationType, OBAlertInteractionOperationType };
