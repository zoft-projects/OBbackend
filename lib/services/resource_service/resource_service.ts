import { FilterQuery, QueryOptions } from 'mongoose';
import { AudienceEnum, ReadFileTypeEnum, S3FoldersEnum } from '../../enums';
import { logInfo, logError, logDebug } from '../../log/util';
import { OBResourceModel } from '../../models';
import { NormalizedResourceType, OBResourceSchemaType, OBResourceUpsertOperationType } from '../../types';
import { createNanoId, mapResourceRequestToDBRecord, prefixResourceId } from '../../utils';
import * as multiMediaService from '../multimedia_service/multimedia_service';

const createResource = async (
  transactionId: string,
  resource: OBResourceUpsertOperationType,
): Promise<OBResourceSchemaType> => {
  try {
    if (!resource.resourceName || !resource.audienceLevel) {
      throw new Error('Missing mandatory fields for creating resource: name, audienceLevel');
    }
    switch (resource.audienceLevel) {
      case AudienceEnum.Branch:
        if (!Array.isArray(resource.branchIds) || resource.branchIds.length === 0) {
          throw new Error('Missing mandatory field branchIds');
        }
        break;
      case AudienceEnum.Division:
        if (!Array.isArray(resource.divisionIds) || resource.divisionIds.length === 0) {
          throw new Error('Missing mandatory field divisionIds');
        }
        break;
      case AudienceEnum.Province:
        if (!Array.isArray(resource.provincialCodes) || resource.provincialCodes.length === 0) {
          throw new Error('Missing mandatory field provincialCodes');
        }
        break;
      default:
        resource.audienceLevel = AudienceEnum.National;
        break;
    }

    if (!resource.resourceId) {
      const id = createNanoId(5);
      resource.resourceId = prefixResourceId(id);
    }

    if (resource.multimedia) {
      resource.multimedia = await multiMediaService.storeMultiMedia(
        transactionId,
        resource.multimedia,
        S3FoldersEnum.Resources,
      );
    }

    const translatedResource = mapResourceRequestToDBRecord(resource);

    if (resource.audienceLevel === AudienceEnum.National) {
      translatedResource.branchIds = [];
      translatedResource.divisionIds = [];
      translatedResource.provincialCodes = [];
    }

    logInfo(
      `[${transactionId}] [SERVICE] createResource - create record initiated for resourceId: ${translatedResource.resourceId}`,
    );

    const newObResource = new OBResourceModel(translatedResource);

    const createdResource = await newObResource.save();

    const createdData = createdResource.toJSON();

    logInfo(
      `[${transactionId}] [SERVICE] createResource - create record SUCCESSFUL for resourceId: ${translatedResource.resourceId}`,
    );

    return createdData;
  } catch (createErr) {
    logError(
      `[${transactionId}] [SERVICE] createResource - ERROR creating resource ${resource.resourceId}, reason: ${createErr.message}`,
    );

    throw createErr;
  }
};

const createResourceByUserId = async (
  transactionId: string,
  resource: OBResourceUpsertOperationType,
): Promise<OBResourceSchemaType> => {
  try {
    if (!resource.userPsId || resource.audienceLevel !== AudienceEnum.Individual) {
      throw new Error("Missing mandatory fields for creating resource: userPsId, audienceLevel must be 'Individual'");
    }

    if (!resource.resourceId) {
      const id = createNanoId(5);
      resource.resourceId = prefixResourceId(id);
    }

    if (resource.multimedia) {
      resource.multimedia = await multiMediaService.storeMultiMedia(
        transactionId,
        resource.multimedia,
        S3FoldersEnum.Resources,
      );
    }

    const translatedResource = mapResourceRequestToDBRecord(resource);

    logInfo(
      `[${transactionId}] [SERVICE] createResourceByUserId - create record initiated for resourceId: ${translatedResource.resourceId}`,
    );

    const newObResource = new OBResourceModel(translatedResource);

    const createdResource = await newObResource.save();

    const createdData = createdResource.toJSON();

    logInfo(
      `[${transactionId}] [SERVICE] createResourceByUserId - create record SUCCESSFUL for resourceId: ${translatedResource.resourceId}`,
    );

    return createdData;
  } catch (createErr) {
    logError(
      `[${transactionId}] [SERVICE] createResourceByUserId - ERROR creating resource ${resource.resourceId}, reason: ${createErr.message}`,
    );

    throw createErr;
  }
};

const updateResource = async (
  transactionId: string,
  resourcePartialFields: Partial<OBResourceSchemaType>,
): Promise<string> => {
  logInfo(
    `[${transactionId}] [SERVICE] updateResource - updating resource for resourceId: ${resourcePartialFields.resourceId}`,
  );

  try {
    if (!resourcePartialFields.resourceId) {
      throw new Error('Missing mandatory field resourceId for update');
    }

    const updatedResource = await OBResourceModel.findOneAndUpdate(
      {
        resourceId: resourcePartialFields.resourceId,
      },
      {
        ...resourcePartialFields,
        updatedAt: new Date(),
      },
      {
        new: true,
      },
    );

    logInfo(`[${transactionId}] [SERVICE] updateResource - SUCCESSFUL for resourceId: ${updatedResource.resourceId}`);

    return updatedResource.resourceId;
  } catch (updateErr) {
    logError(
      `[${transactionId}] [SERVICE] updateResource - FAILED for resourceId: ${resourcePartialFields.resourceId}, reason: ${updateErr.message}`,
    );
    logDebug(
      `[${transactionId}] [SERVICE] updateResource - FAILED details, provided: ${JSON.stringify(
        resourcePartialFields,
      )}`,
    );

    throw updateErr;
  }
};

const getMediaResourceByResourceIds = async (
  transactionId: string,
  resourceId: string,
): Promise<NormalizedResourceType> => {
  try {
    logInfo(
      `[${transactionId}] [SERVICE] getMediaResourceByResourceIds - find resource by ID, requested: ${resourceId}`,
    );

    const resource = await OBResourceModel.findOne({ resourceId, isDeleted: false });

    if (!resource) {
      throw new Error('The requested poll cannot be found or has been deleted');
    }

    const normalizedResource = async (resource: OBResourceSchemaType) => {
      let signedResourceUrl: unknown;
      if (resource.multimedia?.image?.url) {
        signedResourceUrl = (await multiMediaService.readFileFromS3(transactionId, {
          key: resource.multimedia.image.url,
          readType: ReadFileTypeEnum.PresignedUrl,
        })) as string;
      } else if (resource.multimedia?.document?.url) {
        signedResourceUrl = (await multiMediaService.readFileFromS3(transactionId, {
          key: resource.multimedia.document.url,
          readType: ReadFileTypeEnum.PresignedUrl,
        })) as string;
      }

      return { resource, resourceUrl: signedResourceUrl as string } as NormalizedResourceType;
    };

    logInfo(
      `[${transactionId}] [SERVICE] getMediaResourceByResourceIds - find resource by ID, completed: ${resourceId}`,
    );

    const mappedResource = await normalizedResource(resource);

    return mappedResource as NormalizedResourceType;
  } catch (readError) {
    logError(
      `[${transactionId}] [SERVICE] getMediaResourceByResourceIds - ERROR reading resource, reason: ${readError.message} & resource ID ${resourceId}`,
    );
    throw new Error('Unable to read resource by ID');
  }
};

const getResourcesByResourceIds = async (
  transactionId: string,
  resourceIds: string[],
): Promise<OBResourceSchemaType[]> => {
  const matchingResources: OBResourceSchemaType[] = [];

  logInfo(
    `[${transactionId}] [SERVICE] getResourcesByResourceIds - find entries, requested: ${JSON.stringify(resourceIds)}`,
  );

  try {
    const resourcesCursor = OBResourceModel.find({
      resourceId: {
        $in: resourceIds,
      },
    }).cursor();

    for await (const resources of resourcesCursor) {
      matchingResources.push(resources.toJSON());
    }
  } catch (readError) {
    logError(
      `[${transactionId}] [SERVICE] getResourcesByResourceIds - ERROR reading entries, reason: ${readError.message}`,
    );

    throw new Error('Unable to read the entries');
  }

  return matchingResources;
};

const removeResource = async (
  transactionId: string,
  removeResourceId: string,
  forceDelete = false,
): Promise<string> => {
  logInfo(`[${transactionId}] [SERVICE] removeResource - Removing resource ${removeResourceId}`);

  try {
    if (!removeResourceId) {
      throw new Error('Provide a valid resourceId to remove');
    }

    if (forceDelete) {
      // Hard Delete
      const { deletedCount } = await OBResourceModel.deleteOne({ resourceId: removeResourceId });

      logInfo(
        `[${transactionId}] [SERVICE] removeResource - Hard Removing resource SUCCESSFUL for resourceId: ${removeResourceId}, deletedCount: ${deletedCount}`,
      );
    } else {
      // Soft Delete
      await OBResourceModel.findOneAndUpdate(
        { resourceId: removeResourceId },
        { isDeleted: true, updatedAt: new Date() },
        { new: true },
      );

      logInfo(
        `[${transactionId}] [SERVICE] removeResource - Soft Removing resource SUCCESSFUL for resourceId: ${removeResourceId}`,
      );
    }

    return removeResourceId;
  } catch (removeErr) {
    logError(`[${transactionId}] [SERVICE] removeResource - Removing resource FAILED, reason: ${removeErr.message}`);

    throw removeErr;
  }
};

const getResourcesByFilter = async (
  transactionId: string,
  filters: FilterQuery<OBResourceSchemaType>,
  options?: QueryOptions<OBResourceSchemaType>,
): Promise<NormalizedResourceType[]> => {
  logInfo(
    `[${transactionId}] [SERVICE] getResourcesByFilter - find all resources by filters: ${JSON.stringify(
      filters,
    )}, options: ${JSON.stringify(options)}`,
  );

  try {
    const searchQuery: FilterQuery<OBResourceSchemaType> = {};
    if (options?.search) {
      const searchRegex = new RegExp(options.search, 'i');
      searchQuery.$or = [{ resourceId: searchRegex }, { resourceName: searchRegex }];
    }

    const sortQuery: QueryOptions<OBResourceSchemaType> = {};
    if (options?.sortField) {
      sortQuery[options.sortField] = options.sortOrder === 'asc' ? 1 : -1;
    } else {
      sortQuery.createdAt = -1;
    }

    const resourceQueryCursor = OBResourceModel.find({ ...filters, ...searchQuery })
      .sort(sortQuery)
      .skip(options.skip)
      .limit(options.limit)
      .cursor();

    const resources: OBResourceSchemaType[] = [];

    for await (const resource of resourceQueryCursor) {
      resources.push(resource.toJSON());
    }

    logInfo(
      `[${transactionId}] [SERVICE] getResourcesByFilter - total resources retrieved, length: ${resources.length}`,
    );

    const normalizedResource = async (resource: OBResourceSchemaType) => {
      let signedResourceUrl: unknown;
      if (resource.multimedia?.image?.url) {
        signedResourceUrl = (await multiMediaService.readFileFromS3(transactionId, {
          key: resource.multimedia.image.url,
          readType: ReadFileTypeEnum.PresignedUrl,
        })) as string;
      } else if (resource.multimedia?.document?.url) {
        signedResourceUrl = (await multiMediaService.readFileFromS3(transactionId, {
          key: resource.multimedia.document.url,
          readType: ReadFileTypeEnum.PresignedUrl,
        })) as string;
      }

      return { resource, resourceUrl: signedResourceUrl as string } as NormalizedResourceType;
    };

    const mappedResources = await Promise.all(
      resources.map(async (resource) => {
        return normalizedResource(resource);
      }),
    );

    logInfo(`[${transactionId}] [SERVICE] getResourcesByFilter - resources mapped successfully`);

    return mappedResources as NormalizedResourceType[];
  } catch (getErr) {
    logError(`[${transactionId}] [SERVICE] getResourcesByFilter - FAILED,  reason: ${getErr.message}`);
    throw getErr;
  }
};

export {
  createResource,
  createResourceByUserId,
  updateResource,
  getMediaResourceByResourceIds,
  getResourcesByResourceIds,
  removeResource,
  getResourcesByFilter,
};
