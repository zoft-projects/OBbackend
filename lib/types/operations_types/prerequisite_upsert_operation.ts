import { ActiveStateEnum, AudienceEnum, ProvincialCodesEnum, UserLevelEnum } from '../../enums';

type OBPrerequisiteCreateOperationType = {
  prerequisiteId: string;
  title: string;
  description: string;
  status: string;
  systemComments?: string;
  expiresAt?: Date;
};

type OBPrerequisiteAcceptanceOperationType = {
  prerequisiteId: string;
  type: string;
  employeePsId: string;
  title?: string;
  response: string;
  deviceInfo: string;
  ipAddress: string;
  os: string;
};

type OBUserPrerequisiteUpsertOperationType = {
  prerequisiteId: string;
  employeePsId: string;
  type?: string;
  title?: string;
  response?: string;
  status?: string;
  respondedAt?: Date;
};

type OBPrerequisiteUpsertOperationType = {
  overrideId?: string;
  title: string;
  description: string;
  status: ActiveStateEnum;
  audienceLevel: AudienceEnum;
  skippable: boolean;
  declinable: boolean;
  requiresAssertion: boolean;
  assertionText?: string;
  branchIds?: string[];
  provincialCodes?: ProvincialCodesEnum[];
  divisionIds?: string[];
  accessLevelNames: UserLevelEnum[];
  shouldConfirmRead?: boolean;
  expiresAt?: Date;
};

export {
  OBUserPrerequisiteUpsertOperationType,
  OBPrerequisiteCreateOperationType,
  OBPrerequisiteAcceptanceOperationType,
  OBPrerequisiteUpsertOperationType,
};
