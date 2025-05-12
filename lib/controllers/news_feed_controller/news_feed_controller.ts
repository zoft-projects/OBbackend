import { HttpStatusCode } from '@bayshore-healthcare/lib-error-middleware';
import { pingAuthMiddleware } from '@bayshore-healthcare/lib-ping-authentication-middleware';
import express, { NextFunction } from 'express';
import { FilterQuery } from 'mongoose';
import multer from 'multer';
import { IAppConfig } from '../../config';
import { AudienceEnum, NewsFeedEnum, StatusEnum, UserLevelEnum } from '../../enums';
import { getLogger, logError, logInfo } from '../../log/util';
import { identityMiddleware, accessControlMiddlewareHOF } from '../../middlewares';
import { featureSummariesService, newsFeedService } from '../../services';
import {
  HttpPOSTCreateOBNewsFeed,
  HttpPOSTNewsInteraction,
  OBNewsFeedUpsertOperationType,
  OBNewsSchemaType,
  ObNewsFileBufferTypeData,
} from '../../types';
import {
  endOfDay,
  mapAccessLevelToName,
  mapDBNewsToApiPayload,
  mapNewsApiRequestToServiceRequest,
  mapNewsInteractionRequestToServiceRequest,
  startOfDay,
} from '../../utils';
import { BaseController } from '../base_controller';
const upload = multer({ storage: multer.memoryStorage() });

const logger = getLogger();

const authenticationMiddleware = pingAuthMiddleware({ logger });

export class NewsFeedController extends BaseController {
  public basePath: string;
  public router: express.Router;

  constructor(appConfig: IAppConfig) {
    super(appConfig.envConfig);
    this.basePath = `${this.API_BASE_URL}/news-feeds`;
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
      accessControlMiddlewareHOF([
        UserLevelEnum.FIELD_STAFF,
        UserLevelEnum.BRANCH_ADMIN,
        UserLevelEnum.ADMIN,
        UserLevelEnum.CONTROLLED_ADMIN,
        UserLevelEnum.SUPER_ADMIN,
      ]),
      upload.single('file'),
      this.createNewsFeed,
    );
    this.router.put(
      `${this.basePath}/:newsId`,
      accessControlMiddlewareHOF([UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      upload.single('file'),
      this.updateNewsFeed,
    );
    this.router.post(
      `${this.basePath}/:newsId/reaction`,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF, UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      this.newsInteracted,
    );
    this.router.delete(
      `${this.basePath}/:newsId`,
      accessControlMiddlewareHOF([UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      this.removeNews,
    );
    this.router.get(
      `${this.basePath}/:newsId`,
      accessControlMiddlewareHOF([
        UserLevelEnum.FIELD_STAFF,
        UserLevelEnum.BRANCH_ADMIN,
        UserLevelEnum.ADMIN,
        UserLevelEnum.CONTROLLED_ADMIN,
        UserLevelEnum.SUPER_ADMIN,
      ]),
      this.getNewsById,
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
      this.listNewsFeed,
    );
  }

  private createNewsFeed = async (
    request: express.Request & { file: Express.Multer.File },
    response: express.Response,
    next: NextFunction,
  ) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] Create News Feed initiated`);

    try {
      const news: HttpPOSTCreateOBNewsFeed = request.body;

      const { obUserPsId, displayName, profileImgLink, branchIds, jobLvl } = request.obUserIdentity;

      let file: ObNewsFileBufferTypeData = null;
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

      const translatedPost = mapNewsApiRequestToServiceRequest(news, file);

      translatedPost.postedBy = {
        displayName,
        employeePsId: obUserPsId,
      };

      if (profileImgLink) {
        translatedPost.postedBy.userImageLink = profileImgLink;
      }

      translatedPost.currentUser = {
        jobLevel: jobLvl,
        branchIds,
      };

      const createdPost = await newsFeedService.createOBNewsFeed(transactionId, translatedPost);

      response.status(HttpStatusCode.OK).json({
        success: true,
        data: createdPost,
      });
    } catch (err) {
      logError(`[${transactionId}] [CONTROLLER] createPost endpoint failed with error: ${err.message}`);

      next(err);
    }
  };

  private updateNewsFeed = async (
    request: express.Request & { file?: ObNewsFileBufferTypeData },
    response: express.Response,
    next: NextFunction,
  ) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] updateNews initiated`);

    try {
      const partialNewsInfo: HttpPOSTCreateOBNewsFeed = request.body;

      const { obUserPsId, displayName } = request.obUserIdentity;

      let file: ObNewsFileBufferTypeData = null;
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

      const translatedPost: OBNewsFeedUpsertOperationType = mapNewsApiRequestToServiceRequest(partialNewsInfo, file);

      if (!translatedPost.newsId) {
        throw new Error('Unable to update news, please provide the mandatory details!');
      }

      translatedPost.updatedBy = {
        employeePsId: obUserPsId,
        displayName,
      };

      if (translatedPost.status && translatedPost.status in StatusEnum) {
        translatedPost.approvedBy = {
          employeePsId: obUserPsId,
          displayName,
        };
      }

      const updatedPost = await newsFeedService.updateOBNews(transactionId, translatedPost);

      response.status(HttpStatusCode.OK).json(updatedPost);

      // Update the feature summary without blocking the response
      if (
        updatedPost.category === NewsFeedEnum.Story &&
        [StatusEnum.Approved, StatusEnum.Rejected].includes(updatedPost.status)
      ) {
        const start = startOfDay(new Date(updatedPost.createdAt));
        const end = endOfDay(new Date(updatedPost.createdAt));
        logInfo(
          `[${transactionId}] [CONTROLLER] updateNews adding metric summary for story, start: ${start}, end: ${end}`,
        );
        await featureSummariesService.addMetricSummaryByDay(transactionId, start, end);
      }
    } catch (updateErr) {
      logError(`[${transactionId}] [CONTROLLER] updateNews FAILED, reason: ${updateErr.message}`);

      next(updateErr);
    }
  };

  private newsInteracted = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] News Interacted initiated`);

    try {
      const newsInteraction: HttpPOSTNewsInteraction = request.body;

      if (!newsInteraction.newsId || !newsInteraction.reactionType) {
        throw new Error('Required fields are missing');
      }

      const translatedInteraction = mapNewsInteractionRequestToServiceRequest(newsInteraction);

      const { obUserPsId, displayName, profileImgLink } = request.obUserIdentity;

      translatedInteraction.reactedUserPsId = obUserPsId;
      translatedInteraction.userDisplayName = displayName;

      if (profileImgLink) {
        translatedInteraction.userImageLink = profileImgLink;
      }

      await newsFeedService.newsInteracted(transactionId, translatedInteraction);

      return response.status(HttpStatusCode.OK).json({ message: 'Success' });
    } catch (err) {
      logError(`[${transactionId}] [CONTROLLER] Reaction endpoint failed with error: ${err.message}`);

      next(err);
    }
  };

  private removeNews = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] removeNews initiated`);
    try {
      const { newsId } = request.params;

      if (!newsId) {
        throw new Error('Unable to remove news, please provide the mandatory details!');
      }

      logInfo(`[${transactionId}] [CONTROLLER] removeNews check news exists for newsId: ${newsId}`);

      const [newsToRemove] = await newsFeedService.getNewsByNewsIds(transactionId, [newsId]);

      if (!newsToRemove) {
        throw new Error('Cannot remove news that does not exist in the system');
      }

      logInfo(`[${transactionId}] [CONTROLLER] removeNews removing news: ${JSON.stringify(newsToRemove)}`);

      const removedNewsId = await newsFeedService.removeNewsByNewsId(transactionId, newsId);

      logInfo(`[${transactionId}] [CONTROLLER] removeNews SUCCESSFUL newsId: ${removedNewsId}`);

      response.status(HttpStatusCode.OK).json({
        success: true,
        message: `News removed successfully for ${removedNewsId}`,
      });

      // Remove the feature summary without blocking the response
      if (
        newsToRemove.category === NewsFeedEnum.Story &&
        [StatusEnum.Approved, StatusEnum.Rejected].includes(newsToRemove.status)
      ) {
        await featureSummariesService.deleteStorySummary(transactionId, newsId);

        const start = startOfDay(new Date(newsToRemove.createdAt));
        const end = endOfDay(new Date(newsToRemove.createdAt));
        logInfo(
          `[${transactionId}] [CONTROLLER] updateNews adding metric summary for story, start: ${start}, end: ${end}`,
        );
        await featureSummariesService.addMetricSummaryByDay(transactionId, start, end);
      }
    } catch (removeErr) {
      logError(`[${transactionId}] [CONTROLLER] removeNews FAILED, reason: ${removeErr.message}`);

      next(removeErr);
    }
  };

  private getNewsById = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] getNews initiated`);
    try {
      const { newsId } = request.params;

      if (!newsId) {
        throw new Error('Unable to get news, please provide the newsId!');
      }

      const { obUserPsId } = request.obUserIdentity;

      logInfo(`[${transactionId}] [CONTROLLER] getNews retrieving news for newsId: ${newsId}`);

      const [news] = await newsFeedService.getNewsByNewsIds(transactionId, [newsId]);

      if (!news) {
        return response.status(HttpStatusCode.NOT_FOUND).json({
          success: false,
          message: 'News not found',
        });
      }

      const normalizedNews = await newsFeedService.normalizeNews(transactionId, news, {
        currentUserPsId: obUserPsId,
      });

      const mappedNewsFeed = {
        ...normalizedNews.news,
        signedImageUrl: normalizedNews.additionalDetails.signedImageUrl,
        signedAudioUrl: normalizedNews.additionalDetails.signedAudioUrl,
      };

      logInfo(`[${transactionId}] [CONTROLLER] getNews retrieved news: ${JSON.stringify(news)}`);

      response.status(HttpStatusCode.OK).json({
        success: true,
        data: mappedNewsFeed,
      });
    } catch (getErr) {
      logError(`[${transactionId}] [CONTROLLER] getNews failed, reason: ${getErr.message}`);

      next(getErr);
    }
  };

  private listNewsFeed = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] listNewsFeed initiated`);

    try {
      const {
        obUserPsId,
        branchIds: userBranchIds,
        divisionIds: userDivisionIds,
        provinceCodes: userProvinceCodes,
        accessLvl,
        jobLvl,
      } = request.obUserIdentity;

      const {
        skip,
        limit,
        category,
        audienceLevel,
        status,
        search,
        viewAs,
        sortField,
        sortOrder,
      }: {
        skip?: string;
        limit?: string;
        category?: NewsFeedEnum;
        audienceLevel?: AudienceEnum;
        status?: StatusEnum;
        search?: string;
        viewAs?: string;
        sortField?: string;
        sortOrder?: 'asc' | 'desc';
      } = request.query;

      const makeFilter = (): FilterQuery<OBNewsSchemaType> => {
        let filter: FilterQuery<OBNewsSchemaType> = {};

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

      const filters = makeFilter();
      filters.isDeleted = false;

      if (userBranchIds.includes('*')) {
        if (filters.$or) {
          filters.$or.push({ branchIds: { $ne: [] } });
        } else {
          filters.$or = [{ branchIds: { $ne: [] } }];
        }
      }

      if (category && category in NewsFeedEnum) {
        filters.category = category;
      }

      if (status && status in StatusEnum) {
        filters.status = status;
      } else {
        filters.status = StatusEnum.Approved;
      }

      const accessLevelName = mapAccessLevelToName(accessLvl);

      logInfo(
        `[${transactionId}] [CONTROLLER] listNewsFeed query requested for filters: ${JSON.stringify(filters)}, limit: ${
          +limit || 10
        }, skip: ${+skip || 0}`,
      );

      const newsFeed = await newsFeedService.getNewsFeedByFilter(
        transactionId,
        {
          userPsId: obUserPsId,
          branchIds: userBranchIds,
          divisionIds: userDivisionIds,
          provincialCodes: userProvinceCodes,
          jobLevel: jobLvl,
          accessLevelName,
        },
        viewAs,
        {
          ...filters,
        },
        {
          limit: +limit || 10,
          skip: +skip || 0,
          sortField,
          sortOrder,
          search,
        },
      );

      const mappedNewsFeed = newsFeed.map((news) => mapDBNewsToApiPayload(news));

      response.status(HttpStatusCode.OK).json({
        success: true,
        data: mappedNewsFeed,
      });
    } catch (listErr) {
      logError(`[${transactionId}] [CONTROLLER] listNewsFeed FAILED, reason: ${listErr.message}`);

      next(listErr);
    }
  };
}
