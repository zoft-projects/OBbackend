import { JSONLikeType } from '..';
import {
  PriorityEnum,
  ScreenEnum,
  ProvincialCodesEnum,
  AudienceEnum,
  ActiveStateEnum,
  MilestoneTypeEnum,
} from '../../enums';

type OBMilestoneTasks = {
  milestoneId?: string;
  audienceLevel?: AudienceEnum;
  provincialCodes?: ProvincialCodesEnum[];
  divisionIds?: string[];
  branchIds?: string[];
  userPsIds?: string[];
  status?: ActiveStateEnum;
  approach: MilestoneTypeEnum;
  milestoneTitle: string;
  milestoneDescription: string;
  dayGapForNotification?: number;
  redirectionProps?: {
    screenName: ScreenEnum;
    data: JSONLikeType;
  };
  specificDate?: Date;
  startDate?: Date;
  isDeleted?: boolean;
  expiresAt?: Date;
  priority: PriorityEnum;
};
type OBMilestoneOperationType = {
  id?: string;
  batchId?: string;
  milestoneTasks: OBMilestoneTasks[];
};

export { OBMilestoneOperationType };
