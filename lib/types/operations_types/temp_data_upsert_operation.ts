import { JSONLikeType } from '..';
import { ActiveStateEnum, TempDataValueEnum } from '../../enums';

type TempDataUpsertOperationType = {
  primaryIdentifier: string;
  secondaryIdentifier?: string;
  valueType: TempDataValueEnum;
  payload?: JSONLikeType;
  valueStatus?: ActiveStateEnum;
  comment?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export { TempDataUpsertOperationType };
