import { ProvincialCodesEnum, AudienceEnum, MultiMediaEnum } from '../../enums';

type OBResourceUserSchemaType = {
  employeePsId: string;
  displayName: string;
  userImageLink?: string;
};

type OBResourceImageSchemaType = {
  url: string;
  bucketName: string;
  orientation: string;
  width?: number;
  height?: number;
};

type OBResourceVideoSchemaType = {
  url: string;
  bucketName?: string;
  sourceType?: string;
};

type OBResourceDocumentSchemaType = {
  url: string;
  bucketName?: string;
  sourceType?: string;
};

type OBResourceMultiMediaSchemaType = {
  image?: OBResourceImageSchemaType;
  video?: OBResourceVideoSchemaType;
  document?: OBResourceDocumentSchemaType;
  mediaType: MultiMediaEnum;
};

type OBResourceSchemaType = {
  id?: string;
  resourceId: string;
  resourceName: string;
  multimedia?: OBResourceMultiMediaSchemaType;
  audienceLevel: AudienceEnum;
  userPsId?: string;
  branchIds?: string[];
  provincialCodes?: ProvincialCodesEnum[];
  divisionIds?: string[];
  isDeleted: boolean;
  createdBy: OBResourceUserSchemaType;
  updatedBy?: OBResourceUserSchemaType;
  createdAt: Date;
  updatedAt: Date;
};

export {
  OBResourceSchemaType,
  OBResourceMultiMediaSchemaType,
  OBResourceUserSchemaType,
  OBResourceImageSchemaType,
  OBResourceDocumentSchemaType,
  OBResourceVideoSchemaType,
};
