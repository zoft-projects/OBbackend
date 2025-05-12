import config from 'config';
import { AudienceEnum, FileTransportEnum, MultiMediaEnum, ProvincialCodesEnum } from '../../enums';
import {
  HttpPOSTCreateOBResource,
  NormalizedResourceType,
  OBBranchDetailedOperationType,
  OBDivisionSchemaType,
  OBResourceFileBufferType,
  OBResourceSchemaType,
  OBResourceUpsertOperationType,
  ResourcePayloadType,
  MediaResourcePayloadType,
} from '../../types';

const s3BucketName: string = config.get('Services.s3.bucketName');

const mapResourceApiRequestToServiceRequest = (
  requestData: HttpPOSTCreateOBResource,
  file?: OBResourceFileBufferType,
): OBResourceUpsertOperationType => {
  const {
    resourceName,
    audienceLevel,
    branchIds,
    divisionIds,
    provincialCodes,
    imageUrl,
    docUrl,
    fileType,
    mediaType,
  } = requestData;

  const mappedPayload: Partial<OBResourceUpsertOperationType> = {};

  if (resourceName) {
    mappedPayload.resourceName = resourceName;
  }

  if (audienceLevel && audienceLevel in AudienceEnum) {
    mappedPayload.audienceLevel = audienceLevel as AudienceEnum;
  }

  if (Array.isArray(branchIds) && branchIds.length > 0) {
    mappedPayload.branchIds = branchIds;
  }

  if (Array.isArray(provincialCodes) && provincialCodes.length > 0) {
    const validProvincialCodes: ProvincialCodesEnum[] = [];

    provincialCodes.forEach((provincialCode) => {
      if (provincialCode in ProvincialCodesEnum) {
        validProvincialCodes.push(provincialCode as ProvincialCodesEnum);
      }
    });

    mappedPayload.provincialCodes = validProvincialCodes;
  }

  if (Array.isArray(divisionIds) && divisionIds.length > 0) {
    mappedPayload.divisionIds = divisionIds;
  }

  if (fileType === FileTransportEnum.Link) {
    mappedPayload.multimedia = {
      type: FileTransportEnum.Link,
    };

    if (imageUrl) {
      mappedPayload.multimedia = {
        ...mappedPayload.multimedia,
        image: {
          url: imageUrl,
          bucketName: s3BucketName,
        },
      };
    }

    if (docUrl) {
      mappedPayload.multimedia = {
        ...mappedPayload.multimedia,
        document: {
          url: docUrl,
          bucketName: s3BucketName,
        },
      };
    }
  }

  if (fileType === FileTransportEnum.Buffer) {
    mappedPayload.multimedia = {
      type: FileTransportEnum.Buffer,
    };

    const fileData = {
      fieldName: file.fieldName,
      originalName: file.originalName,
      encoding: file.encoding,
      mimetype: file.mimetype,
      size: file.size,
      buffer: file.buffer,
    };

    if (mediaType === MultiMediaEnum.Image) {
      mappedPayload.multimedia = {
        ...mappedPayload.multimedia,
        image: {
          buffer: fileData,
          bucketName: s3BucketName,
        },
      };
    }

    if (mediaType === MultiMediaEnum.Document) {
      mappedPayload.multimedia = {
        ...mappedPayload.multimedia,
        document: {
          buffer: fileData,
          bucketName: s3BucketName,
        },
      };
    }
  }

  if (requestData.createdByUserId) {
    mappedPayload.createdBy = { employeePsId: requestData.createdByUserId, displayName: requestData.createdByUserName };
  }

  if (typeof requestData.isDeleted === 'boolean') {
    mappedPayload.isDeleted = requestData.isDeleted;
  }

  if (requestData.createdAt) {
    mappedPayload.createdAt = new Date(requestData.createdAt);
  }

  if (requestData.updatedAt) {
    mappedPayload.updatedAt = new Date(requestData.updatedAt);
  }

  return mappedPayload as OBResourceUpsertOperationType;
};

const mapResourceRequestToDBRecord = (resource: OBResourceUpsertOperationType): OBResourceSchemaType => {
  const mappedResource: Partial<OBResourceSchemaType> = {
    resourceId: resource.resourceId,
    resourceName: resource.resourceName,
    createdBy: resource.createdBy,
  };

  if (resource.audienceLevel in AudienceEnum) {
    mappedResource.audienceLevel = resource.audienceLevel as AudienceEnum;
  }

  if (Array.isArray(resource.branchIds) && resource.branchIds.length > 0) {
    mappedResource.branchIds = resource.branchIds;
  }

  if (Array.isArray(resource.provincialCodes) && resource.provincialCodes.length > 0) {
    const validProvincialCodes: ProvincialCodesEnum[] = [];

    resource.provincialCodes.forEach((provincialCode) => {
      if (provincialCode in ProvincialCodesEnum) {
        validProvincialCodes.push(provincialCode as ProvincialCodesEnum);
      }
    });

    mappedResource.provincialCodes = validProvincialCodes;
  }

  if (Array.isArray(resource.divisionIds) && resource.divisionIds.length > 0) {
    mappedResource.divisionIds = resource.divisionIds;
  }

  if (resource.multimedia?.image) {
    const imageProperties = resource.multimedia.image;
    mappedResource.multimedia = {
      mediaType: MultiMediaEnum.Image,
      image: {
        url: imageProperties.url,
        bucketName: imageProperties.bucketName,
        height: imageProperties.height,
        width: imageProperties.width,
        orientation: imageProperties.orientation,
      },
    };
  }

  if (resource.multimedia?.video) {
    const videoProperties = resource.multimedia.video;
    mappedResource.multimedia = {
      mediaType: MultiMediaEnum.Video,
      video: {
        url: videoProperties.url,
        bucketName: videoProperties.bucketName,
      },
    };
  }

  if (resource.multimedia?.document) {
    const documentProperties = resource.multimedia.document;
    mappedResource.multimedia = {
      mediaType: MultiMediaEnum.Document,
      document: {
        url: documentProperties.url,
        bucketName: documentProperties.bucketName,
      },
    };
  }

  if (resource.isDeleted) {
    mappedResource.isDeleted = resource.isDeleted;
  }

  if (resource.createdAt) {
    mappedResource.createdAt = resource.createdAt;
  }

  if (resource.updatedAt) {
    mappedResource.updatedAt = resource.updatedAt;
  }

  return mappedResource as OBResourceSchemaType;
};

const mapDBResourceToApiPayload = (resourceNormalizedData: NormalizedResourceType): MediaResourcePayloadType => {
  const mappedPayload: Partial<MediaResourcePayloadType> = {};
  if (resourceNormalizedData.resource.multimedia?.image) {
    mappedPayload.mediaType = MultiMediaEnum.Image;
  }
  if (resourceNormalizedData.resource.multimedia?.video) {
    mappedPayload.mediaType = MultiMediaEnum.Video;
  }
  if (resourceNormalizedData.resource.multimedia?.document) {
    mappedPayload.mediaType = MultiMediaEnum.Document;
  }
  if (resourceNormalizedData.resourceUrl) {
    mappedPayload.resourceUrl = resourceNormalizedData.resourceUrl;
  }

  return mappedPayload as MediaResourcePayloadType;
};

const mapDBResourcesToApiPayload = (
  resourceNormalizedData: NormalizedResourceType,
  additionalDetails: {
    dependencies: {
      branches: OBBranchDetailedOperationType[];
      divisions: OBDivisionSchemaType[];
    };
  } = {
    dependencies: {
      branches: [],
      divisions: [],
    },
  },
): ResourcePayloadType => {
  const { resource, resourceUrl } = resourceNormalizedData;

  const {
    dependencies: { branches, divisions },
  } = additionalDetails;

  const mappedResource: Partial<ResourcePayloadType> = {
    resourceId: resource.resourceId,
    resourceName: resource.resourceName,
    audienceLevel: resource.audienceLevel,
    mediaType: resource.multimedia.mediaType,
    createdAt: resource.createdAt,
    updatedAt: resource.updatedAt,
  };

  if (resourceUrl) {
    mappedResource.resourceUrl = resourceUrl;
  }

  if (Array.isArray(resource.branchIds) && resource.branchIds.length) {
    const uniqueBranches = new Map<string, string>();
    mappedResource.branches = [];

    branches.forEach((branch) => {
      uniqueBranches.set(branch.branchId, branch.branchName);
    });

    resource.branchIds.forEach((branchId) => {
      mappedResource.branches.push({
        branchId,
        branchName: uniqueBranches.get(branchId),
      });
    });
  }

  if (Array.isArray(resource.divisionIds) && resource.divisionIds.length) {
    const uniqueDivisions = new Map();
    mappedResource.divisions = [];

    divisions.forEach((division) => {
      uniqueDivisions.set(division.divisionId, division.divisionName);
    });

    resource.divisionIds.forEach((divisionId) => {
      mappedResource.divisions.push({
        divisionId,
        divisionName: uniqueDivisions.get(divisionId),
      });
    });
  }

  if (Array.isArray(resource.provincialCodes) && resource.provincialCodes.length) {
    const validProvincialCodes: ProvincialCodesEnum[] = [];

    resource.provincialCodes.forEach((provincialCode) => {
      if (provincialCode in ProvincialCodesEnum) {
        validProvincialCodes.push(provincialCode as ProvincialCodesEnum);
      }
    });

    mappedResource.provincialCodes = validProvincialCodes;
  }

  return mappedResource as ResourcePayloadType;
};

export {
  mapResourceApiRequestToServiceRequest,
  mapResourceRequestToDBRecord,
  mapDBResourcesToApiPayload,
  mapDBResourceToApiPayload,
};
