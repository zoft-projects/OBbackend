import { JSONLikeType } from '..';

type OBAnonymizedInfoSchemaType = {
  id?: string;
  identifier: string;
  infoKey: string;
  infoValue: string;
  infoType: string;
  description?: string;
  payload?: JSONLikeType;
  requestIp?: string;
  requestDeviceInfo?: string;
  createdAt: Date;
  updatedAt: Date;
};

export { OBAnonymizedInfoSchemaType };
