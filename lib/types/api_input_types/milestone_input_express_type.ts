import {
  PriorityEnum,
  ProvincialCodesEnum,
  ScreenEnum,
  AudienceEnum,
  ActiveStateEnum,
  MilestoneTypeEnum,
} from '../../enums';

import { JSONLikeType } from '../../types';
type HttpPOSTCreateOBMilestone = {
  id?: string;
  milestoneId: string;
  audienceLevel: AudienceEnum;
  provincialCodes?: ProvincialCodesEnum[];
  divisionIds?: string[];
  branchIds: string[];
  batchId: string;
  status: ActiveStateEnum;
  approach: MilestoneTypeEnum;
  milestoneTitle: string;
  milestoneDescription: string;
  dayGapForNotification?: number;
  redirectionScreen?: ScreenEnum;
  redirectionScreenProps?: JSONLikeType;
  specificDate?: Date;
  startDate: Date;
  isDeleted: boolean;
  expiresAt?: Date;
  priority: PriorityEnum;
  createdAt: Date;
  updatedAt: Date;
};

export { HttpPOSTCreateOBMilestone };
