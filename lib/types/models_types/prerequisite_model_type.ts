import { ActiveStateEnum, AudienceEnum, ProvincialCodesEnum, UserLevelEnum } from '../../enums';

type OBPrerequisiteSchemaType = {
  id?: string;
  preRequisiteId: string;
  title: string;
  description: string;
  status: ActiveStateEnum;
  audienceLevel: AudienceEnum;
  branchIds?: string[];
  provincialCodes?: ProvincialCodesEnum[];
  divisionIds?: string[];
  accessLevelNames: UserLevelEnum[];
  requiresAssertion: boolean;
  assertionText?: string;
  skippable: boolean;
  declinable: boolean;
  shouldConfirmRead?: boolean;
  nextLabel?: string;
  systemComments?: string;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

type OBPrerequisiteAcceptanceSchemaType = {
  id?: string;
  preRequisiteId: string;
  employeePsId: string;
  title?: string;
  response: string;
  deviceInfo: string;
  ipAddress: string;
  os: string;
  responseDate: Date;
  createdAt: Date;
  updatedAt: Date;
};

export { OBPrerequisiteSchemaType, OBPrerequisiteAcceptanceSchemaType };
