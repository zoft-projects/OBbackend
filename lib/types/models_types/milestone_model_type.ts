import { JSONLikeType } from '..';
import {
  NotificationPlacementEnum,
  PriorityEnum,
  ProvincialCodesEnum,
  AudienceEnum,
  ActiveStateEnum,
  ScreenEnum,
  MilestoneTypeEnum,
} from '../../enums';

type OBMilestoneRedirectionSchemaType = {
  screenName: ScreenEnum;
  data?: JSONLikeType;
};

type OBMilestoneAttemptsSchemaType = {
  attemptedDate: string;
  mode: NotificationPlacementEnum;
  priorityAttempt: string;
  isSuccessful: boolean;
};

type OBMilestoneCreatedByType = {
  employeePsId: string;
  displayName: string;
  userImageLink?: string;
};

type OBMilestoneSchemaType = {
  id?: string;
  milestoneId: string;
  audienceLevel: AudienceEnum;
  provincialCodes?: ProvincialCodesEnum[];
  divisionIds?: string[];
  status?: ActiveStateEnum;
  branchIds?: string[];
  batchId: string;
  userPsIds?: string[];
  approach: MilestoneTypeEnum;
  milestoneTitle: string;
  milestoneDescription: string;
  dayGapForNotification?: number;
  specificDate?: Date;
  featureId?: string;
  redirectionProps?: OBMilestoneRedirectionSchemaType;
  startDate?: Date;
  isDeleted: boolean;
  expiresAt?: Date;
  priority: PriorityEnum;
  createdByPsId: OBMilestoneCreatedByType;
  createdAt: Date;
  updatedAt: Date;
};

type OBMilestoneInteractionSchemaType = {
  id?: string;
  batchId: string;
  employeePsId: string;
  milestoneId: string;
  servedDate: Date;
  referenceId?: string;
  status: ActiveStateEnum;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export {
  OBMilestoneSchemaType,
  OBMilestoneInteractionSchemaType,
  OBMilestoneAttemptsSchemaType,
  OBMilestoneCreatedByType,
  OBMilestoneRedirectionSchemaType,
};
