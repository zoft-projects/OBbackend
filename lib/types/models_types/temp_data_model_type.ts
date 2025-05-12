import { JSONLikeType } from '..';
import { ActiveStateEnum } from '../../enums';

type OBTempDataSchemaType = {
  primaryIdentifier: string;
  secondaryIdentifier?: string;
  valueType: string;
  payload?: JSONLikeType;
  valueStatus?: ActiveStateEnum;
  version: string;
  comment?: string;
  createdAt: Date;
  updatedAt: Date;
};

export { OBTempDataSchemaType, JSONLikeType };
