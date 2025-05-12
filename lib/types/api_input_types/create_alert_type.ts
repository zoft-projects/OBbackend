import { AudienceEnum, InteractionTypeEnum, ProvincialCodesEnum } from '../../enums';

type HttpPOSTCreateOBAlert = {
  title: string;
  description: string;
  audienceLevel: AudienceEnum;
  branchIds?: string[];
  divisionIds?: string[];
  provincialCodes?: ProvincialCodesEnum[];
  jobLevels?: number[];
  priority?: string;
  validFrom?: string;
  expiresInDays?: number;
  createdAt?: string;
  updatedAt?: string;
  isDeleted?: boolean;
  createdById?: string;
  createdByName?: string;
  status?: string;
};

type HttpPOSTAlertInteraction = {
  alertId: string;
  interactionType: InteractionTypeEnum;
  interactedUserId: string; // TODO remove after migration
};

export { HttpPOSTCreateOBAlert, HttpPOSTAlertInteraction };
