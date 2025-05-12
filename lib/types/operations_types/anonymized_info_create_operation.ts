import { JSONLikeType } from '..';

type OBAnonymizedInfoCreateOperationType = {
  identifier: string;
  infoKey: string;
  infoValue: string;
  infoType: string;
  description?: string;
  payload?: JSONLikeType;
  requestIp?: string;
  requestDeviceInfo?: string;
  // TODO: Remove after migration
  createdAt?: string;
  updatedAt?: string;
};

export { OBAnonymizedInfoCreateOperationType };
