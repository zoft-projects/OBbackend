import { ActiveStateEnum, TempDataValueEnum } from '../../enums';
import { TempDataUpsertOperationType, OBTempDataSchemaType, JSONLikeType } from '../../types';

const mapTempRequestToDBRecord = (
  operationType: Partial<TempDataUpsertOperationType>,
): Partial<OBTempDataSchemaType> => {
  const schemaType: Partial<OBTempDataSchemaType> = {};

  if (operationType.valueType in TempDataValueEnum) {
    schemaType.valueType = operationType.valueType as TempDataValueEnum;
  }

  if (operationType.primaryIdentifier) {
    schemaType.primaryIdentifier = operationType.primaryIdentifier;
  }

  if (operationType.secondaryIdentifier) {
    schemaType.secondaryIdentifier = operationType.secondaryIdentifier;
  }

  if (operationType.payload) {
    schemaType.payload = operationType.payload as JSONLikeType;
  }

  if (operationType.valueStatus && operationType.valueStatus in ActiveStateEnum) {
    schemaType.valueStatus = operationType.valueStatus as ActiveStateEnum;
  }
  if (operationType.comment) {
    schemaType.comment = operationType.comment;
  }

  return schemaType as OBTempDataSchemaType;
};

export { mapTempRequestToDBRecord };
