import { OBResourceSchemaType } from '..';
import { AudienceEnum, FileTransportEnum, ProvincialCodesEnum } from '../../enums';

type OBResourceFileBufferType = {
  fieldName?: string;
  originalName?: string;
  encoding?: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
};

type OBResourceMultiMediaType = {
  type?: FileTransportEnum.Link | FileTransportEnum.Buffer;
  image?: {
    url?: string;
    bucketName?: string;
    buffer?: OBResourceFileBufferType;
    orientation?: string;
    width?: number;
    height?: number;
  };
  video?: {
    url?: string;
    bucketName?: string;
    buffer?: OBResourceFileBufferType;
    sourceType?: string;
  };
  document?: {
    url?: string;
    bucketName?: string;
    buffer?: OBResourceFileBufferType;
    sourceType?: string;
  };
};

type NormalizedResourceType = {
  resource: OBResourceSchemaType;
  resourceUrl: string;
};

type OBResourceUpsertOperationType = {
  id?: string;
  resourceId: string;
  resourceName: string;
  multimedia?: OBResourceMultiMediaType;
  audienceLevel: AudienceEnum;
  branchIds?: string[];
  userPsId?: string;
  provincialCodes?: ProvincialCodesEnum[];
  divisionIds?: string[];
  isDeleted: boolean;
  createdBy: {
    employeePsId: string;
    displayName: string;
    userImageLink?: string;
  };
  updatedBy?: {
    employeePsId: string;
    displayName: string;
    userImageLink?: string;
  };
  createdAt: Date;
  updatedAt: Date;
};

export { OBResourceFileBufferType, OBResourceUpsertOperationType, NormalizedResourceType };
