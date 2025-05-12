import { JSONLikeType } from './temp_data_model_type';
import {
  AudienceEnum,
  InteractionTypeEnum,
  NotificationPlacementEnum,
  PriorityEnum,
  ProvincialCodesEnum,
  ScreenEnum,
  UserLevelEnum,
} from '../../enums';

enum OBAlertStatus {
  Active = 'Active',
  Inactive = 'Inactive',
}

type OBAlertUserSchemaType = {
  employeePsId: string;
  displayName: string;
  userImageLink?: string;
};

type OBAlertsSchemaType = {
  id?: string;
  alertId: string;
  title: string;
  description: string;
  audienceLevel: AudienceEnum;
  branchIds?: string[];
  provincialCodes?: ProvincialCodesEnum[];
  divisionIds?: string[];
  accessLevelNames: UserLevelEnum[];
  status: OBAlertStatus;
  priority: PriorityEnum;
  validFrom: Date;
  expiresAt?: Date;
  isDeleted: boolean;
  createdBy: OBAlertUserSchemaType;
  updatedBy?: OBAlertUserSchemaType;
  createdAt: Date;
  updatedAt: Date;
  placements?: NotificationPlacementEnum[];
  redirectionScreen?: {
    screenName?: ScreenEnum;
    data?: JSONLikeType;
  };
};

type OBAlertInteractionSchemaType = {
  id?: string;
  alertId: string;
  interactionType: InteractionTypeEnum;
  interactedAt: Date;
  interactedUser: OBAlertUserSchemaType;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export { OBAlertUserSchemaType, OBAlertsSchemaType, OBAlertInteractionSchemaType, OBAlertStatus };
