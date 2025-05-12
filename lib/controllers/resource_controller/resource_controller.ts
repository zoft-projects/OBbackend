import { HttpStatusCode } from '@bayshore-healthcare/lib-error-middleware';
import { pingAuthMiddleware } from '@bayshore-healthcare/lib-ping-authentication-middleware';
import express, { NextFunction } from 'express';
import { FilterQuery } from 'mongoose';
import multer from 'multer';
import { IAppConfig } from '../../config';
import { AudienceEnum, UserLevelEnum, MultipartUploadPhaseEnum } from '../../enums';
import { getLogger, logError, logInfo } from '../../log/util';
import { identityMiddleware, accessControlMiddlewareHOF } from '../../middlewares';
import { locationService, resourceService, multiMediaService } from '../../services';
import {
  HttpPOSTCreateOBResource,
  OBBranchDetailedOperationType,
  OBDivisionSchemaType,
  OBResourceFileBufferType,
  OBResourceSchemaType,
} from '../../types';
import {
  mapAccessLevelToName,
  mapDBResourcesToApiPayload,
  mapDBResourceToApiPayload,
  mapResourceApiRequestToServiceRequest,
} from '../../utils';
import { BaseController } from '../base_controller';

const upload = multer({ storage: multer.memoryStorage() });

const logger = getLogger();

const authenticationMiddleware = pingAuthMiddleware({ logger });

export class ResourceController extends BaseController {
  public basePath: string;
  public router: express.Router;

  constructor(appConfig: IAppConfig) {
    super(appConfig.envConfig);
    this.basePath = `${this.API_BASE_URL}/resources`;
    this.router = express.Router();
    this.router.use(this.basePath, authenticationMiddleware, identityMiddleware);
    this.initializeRoutes();
  }

  public getBasePath(): string {
    return this.basePath;
  }

  public initializeRoutes(): void {
    this.router.post(
      `${this.basePath}`,
      accessControlMiddlewareHOF([UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      upload.single('file'),
      this.createResource,
    );
    this.router.post(`${this.basePath}/file`, this.asyncHandler(this.uploadFile.bind(this)));
    this.router.delete(
      `${this.basePath}/:resourceId`,
      accessControlMiddlewareHOF([UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      this.removeResource,
    );
    this.router.get(
      `${this.basePath}`,
      accessControlMiddlewareHOF([
        UserLevelEnum.FIELD_STAFF,
        UserLevelEnum.BRANCH_ADMIN,
        UserLevelEnum.ADMIN,
        UserLevelEnum.CONTROLLED_ADMIN,
        UserLevelEnum.SUPER_ADMIN,
      ]),
      this.listResources,
    );
    this.router.get(
      `${this.basePath}/:resourceId`,
      accessControlMiddlewareHOF([
        UserLevelEnum.FIELD_STAFF,
        UserLevelEnum.BRANCH_ADMIN,
        UserLevelEnum.ADMIN,
        UserLevelEnum.CONTROLLED_ADMIN,
        UserLevelEnum.SUPER_ADMIN,
      ]),
      this.getResourceById,
    );
  }

  private createResource = async (
    request: express.Request & { file: Express.Multer.File },
    response: express.Response,
    next: NextFunction,
  ) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] createResource initiated`);

    try {
      const requestData: HttpPOSTCreateOBResource = request.body;

      const { obUserPsId, displayName } = request.obUserIdentity;

      let file: OBResourceFileBufferType = null;

      if (request.file) {
        file = {
          fieldName: request.file.fieldname,
          originalName: request.file.originalname,
          encoding: request.file.encoding,
          mimetype: request.file.mimetype,
          size: request.file.size,
          buffer: request.file.buffer,
        };
      }

      const translatedResource = mapResourceApiRequestToServiceRequest(requestData, file);

      // TODO: Remove after migration
      if (!translatedResource.createdBy?.employeePsId) {
        translatedResource.createdBy = {
          employeePsId: obUserPsId,
          displayName,
        };
      }

      const createdResource = await resourceService.createResource(transactionId, translatedResource);

      logInfo(`[${transactionId}] [CONTROLLER] createResource COMPLETED`);

      response.status(HttpStatusCode.OK).json(createdResource);
    } catch (err) {
      logError(`[${transactionId}] [CONTROLLER] createResource endpoint failed with error: ${err.message}`);

      next(err);
    }
  };

  private removeResource = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] removeResource initiated`);

    try {
      const { resourceId } = request.params;
      const { forceDelete: shouldForceDelete }: { forceDelete?: string } = request.query;

      const forceDelete: boolean = shouldForceDelete === 'true';

      if (!resourceId) {
        throw new Error('Unable to remove resource, please provide the mandatory details!');
      }

      logInfo(`[${transactionId}] [CONTROLLER] removeResource check if resource exists for resourceId: ${resourceId}`);

      const [resourceToRemove] = await resourceService.getResourcesByResourceIds(transactionId, [resourceId]);

      if (!resourceToRemove) {
        throw new Error('Cannot remove resource that does not exist in the system');
      }

      logInfo(`[${transactionId}] [CONTROLLER] removeResource removing resource: ${JSON.stringify(resourceToRemove)}`);

      const removedResourceId = await resourceService.removeResource(transactionId, resourceId, forceDelete);

      logInfo(`[${transactionId}] [CONTROLLER] removeResource SUCCESSFUL resourceId: ${removedResourceId}`);

      response.status(HttpStatusCode.OK).json({
        success: true,
        message: `Resource removed successfully for ${removedResourceId}`,
      });
    } catch (removeErr) {
      logError(`[${transactionId}] [CONTROLLER] removeResource FAILED, reason: ${removeErr.message}`);

      next(removeErr);
    }
  };

  private listResources = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] listResources initiated`);

    try {
      const {
        skip,
        limit,
        search,
        viewAs,
        audienceLevel,
        sortField = 'createdAt',
        sortOrder = 'desc',
        branchIds,
      }: {
        skip?: string;
        limit?: string;
        search?: string;
        viewAs?: string;
        audienceLevel?: AudienceEnum;
        sortField?: string;
        sortOrder?: 'asc' | 'desc';
        branchIds?: string;
      } = request.query;

      const {
        divisionIds: userDivisionIds,
        provinceCodes: userProvinceCodes,
        accessLvl: userAccessLevel,
      } = request.obUserIdentity;

      let userBranchIds = request.obUserIdentity.branchIds;

      if (branchIds && branchIds.split(',') && branchIds.split(',').length) {
        userBranchIds = branchIds.split(',');
      }

      const userAccessLevelName = mapAccessLevelToName(userAccessLevel);

      const viewAllResources =
        viewAs &&
        viewAs.toLowerCase() === UserLevelEnum.ADMIN.toLowerCase() &&
        userAccessLevelName !== UserLevelEnum.FIELD_STAFF;

      const actualLimit = +limit || 100;
      const skipPage = +skip || 0;

      let filters: FilterQuery<OBResourceSchemaType> = {};

      if (viewAllResources) {
        filters.isDeleted = false;
      } else {
        const makeFilter = (): FilterQuery<OBResourceSchemaType> => {
          let filter: FilterQuery<OBResourceSchemaType> = {};

          if (AudienceEnum.Branch.toLowerCase() === audienceLevel?.toLowerCase()) {
            filter = {
              audienceLevel: AudienceEnum.Branch,
            };
            if (!userBranchIds.includes('*')) {
              filter = { ...filter, branchIds: { $in: userBranchIds } };
            }

            return filter;
          }

          if (AudienceEnum.Division.toLowerCase() === audienceLevel?.toLowerCase()) {
            filter = {
              audienceLevel: AudienceEnum.Division,
            };
            if (!userDivisionIds.includes('*')) {
              filter = { ...filter, divisionIds: { $in: userDivisionIds } };
            }

            return filter;
          }

          if (AudienceEnum.Province.toLowerCase() === audienceLevel?.toLowerCase()) {
            filter = {
              audienceLevel: AudienceEnum.Province,
            };
            if (!userProvinceCodes.includes('*')) {
              filter = { ...filter, provincialCodes: { $in: userProvinceCodes } };
            }

            return filter;
          }

          return {
            $or: [
              { audienceLevel: AudienceEnum.National },
              { $or: [{ branchIds: { $in: ['*'].concat(userBranchIds) } }] },
              { divisionIds: { $in: userDivisionIds } },
              { provincialCodes: { $in: userProvinceCodes } },
            ],
          };
        };

        filters = makeFilter();
        filters.isDeleted = false;

        if (userBranchIds.includes('*')) {
          if (filters.$or) {
            filters.$or.push({ branchIds: { $ne: [] } });
          } else {
            filters.$or = [{ branchIds: { $ne: [] } }];
          }
        }
      }

      logInfo(
        `[${transactionId}] [CONTROLLER] listResources query requested for filters: ${JSON.stringify(
          filters,
        )}, limit: ${actualLimit}`,
      );

      const resources = await resourceService.getResourcesByFilter(
        transactionId,
        {
          ...filters,
        },
        {
          limit: actualLimit,
          skip: skipPage,
          sortField,
          sortOrder,
          search,
        },
      );

      const resourceBranchIds = new Set(resources.flatMap(({ resource }) => resource.branchIds));
      const divisionIds = new Set(resources.flatMap(({ resource }) => resource.divisionIds));

      const branchList: OBBranchDetailedOperationType[] = await Promise.all(
        Array.from(resourceBranchIds).map((branchId) => locationService.getBranchDetailsById(transactionId, branchId)),
      );

      const divisionsList: OBDivisionSchemaType[] = await locationService.getAllDivisionByIds(
        transactionId,
        Array.from(divisionIds),
      );

      const mappedResources = resources.map((resource) =>
        mapDBResourcesToApiPayload(resource, { dependencies: { branches: branchList, divisions: divisionsList } }),
      );

      response.status(HttpStatusCode.OK).json(mappedResources);
    } catch (listErr) {
      logError(`[${transactionId}] [CONTROLLER] listResources FAILED, reason: ${listErr.message}`);
      next(listErr);
    }
  };

  private getResourceById = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] getResourceById initiated`);
    try {
      const { resourceId }: { resourceId?: string } = request.params;

      if (!resourceId) {
        throw new Error('Unable to get resource, please provide the resource!');
      }

      logInfo(`[${transactionId}] [CONTROLLER] getResourceById retrieving resource for resource: ${resourceId}`);

      const resource = await resourceService.getMediaResourceByResourceIds(transactionId, resourceId);

      if (!resource) {
        throw new Error('The requested resource cannot be found or has been deleted');
      }

      const resourcePayload = mapDBResourceToApiPayload(resource);

      logInfo(`[${transactionId}] [CONTROLLER] getResourceById retrieved resource: ${JSON.stringify(resourcePayload)}`);

      response.status(HttpStatusCode.OK).json(resourcePayload);
    } catch (getErr) {
      logError(`[${transactionId}] [CONTROLLER] getResourceById failed, reason: ${getErr.message}`);

      next(getErr);
    }
  };

  private uploadFile = async (request: express.Request, response: express.Response) => {
    const transactionId = request.txId;
    logInfo(`[${transactionId}] UploadFile controller initiated.`);

    logInfo(`[${transactionId}] Request Body: ${JSON.stringify(request.body)}`);

    try {
      const multipart = request.query.multipart === 'true';
      const phase = request.query.phase as MultipartUploadPhaseEnum;

      logInfo(`[${transactionId}] Multipart: ${multipart}, Phase: ${phase}`);

      if (!multipart) {
        logError(`[${transactionId}] Invalid request: multipart flag is missing.`);

        return response.status(HttpStatusCode.BAD_REQUEST).json({
          success: false,
          message: 'Invalid request: multipart upload flag is required',
        });
      }

      const result = await multiMediaService.UploadMultiPartToS3(transactionId, request.body, phase);

      logInfo(`[${transactionId}] Multipart upload process completed successfully.`);

      return response.status(HttpStatusCode.OK).json({
        success: true,
        data: result,
      });
    } catch (err) {
      logError(`[${transactionId}] [CONTROLLER] UploadFile failed: ${err.message}`);

      return response.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'File upload failed',
        error: err.message,
      });
    }
  };
}
