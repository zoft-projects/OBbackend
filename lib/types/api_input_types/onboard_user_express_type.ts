import { ProvincialCodesEnum } from '../../enums';

type HTTPPostRecoverySSPRType = {
  recoveryEmail?: string;
  recoveryPhone?: string;
};

type HTTPPostCreatePrerequisiteType = {
  overrideId?: string;
  title: string;
  description: string;
  status: string;
  audienceLevel: string;
  branchIds?: string[];
  skippable?: boolean;
  declinable?: boolean;
  requiresAssertion?: boolean;
  assertionText?: string;
  provincialCodes?: ProvincialCodesEnum[];
  divisionIds?: string[];
  shouldConfirmRead?: boolean;
  jobLevels: number[];
  expiresAt?: string;
};

export { HTTPPostRecoverySSPRType, HTTPPostCreatePrerequisiteType };
