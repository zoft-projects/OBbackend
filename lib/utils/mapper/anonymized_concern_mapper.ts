import { OBAnonymizedInfoSchemaType, ConcernPayloadType } from '../../types';

const mapAnonymizedInfoToConcernPayload = (anonymizedInfo: OBAnonymizedInfoSchemaType): ConcernPayloadType => {
  const mappedConcern: Partial<ConcernPayloadType> = {
    createdAt: new Date(anonymizedInfo.createdAt),
  };

  if (anonymizedInfo.payload) {
    mappedConcern.concern = anonymizedInfo.payload.concern as string;
    if (anonymizedInfo.payload.canIncludeIdentity) {
      mappedConcern.concernedBy = {
        employeePsId: anonymizedInfo.payload.concernedUserId as string,
        displayName: anonymizedInfo.payload.concernedUserName as string,
      };
    }
  }

  return mappedConcern as ConcernPayloadType;
};

export { mapAnonymizedInfoToConcernPayload };
