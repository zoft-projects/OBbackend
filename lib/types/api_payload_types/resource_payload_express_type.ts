import { AudienceEnum, MultiMediaEnum, ProvincialCodesEnum } from '../../enums';

type ResourcePayloadType = {
  resourceId: string;
  resourceName: string;
  audienceLevel: AudienceEnum;
  branches?: {
    branchName: string;
    branchId: string;
  }[];
  provincialCodes?: ProvincialCodesEnum[];
  divisions?: {
    divisionName: string;
    divisionId: string;
  }[];
  resourceUrl: string;
  mediaType: MultiMediaEnum;
  createdAt: Date;
  updatedAt: Date;
};

type MediaResourcePayloadType = {
  resourceUrl: string;
  mediaType: MultiMediaEnum;
};

export { ResourcePayloadType, MediaResourcePayloadType };
