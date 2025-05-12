import { HttpStatusCode } from '@bayshore-healthcare/lib-error-middleware';
import { pingAuthMiddleware } from '@bayshore-healthcare/lib-ping-authentication-middleware';
import express, { NextFunction } from 'express';
import { FilterQuery } from 'mongoose';
import { IAppConfig } from '../../config';
import { AudienceEnum } from '../../enums';
import { getLogger, logError, logInfo } from '../../log/util';
import { identityMiddleware } from '../../middlewares';
import { jobBoardService, locationService } from '../../services';
import {
  JobBoardPayloadType,
  HTTPJobBoardInputType,
  OBJobBoardSchemaType,
  OBJobBoardOperationType,
  HttpPutUpdateJobBoard,
} from '../../types';
import { mapDbJobBoardToApiPayload, mapJobBoardApiRequestToServiceRequest, isValidDate, addDays } from '../../utils';
import { BaseController } from '../base_controller';

const logger = getLogger();

const authenticationMiddleware = pingAuthMiddleware({ logger });

export class JobBoardController extends BaseController {
  public basePath: string;
  public router: express.Router;

  constructor(appConfig: IAppConfig) {
    super(appConfig.envConfig);
    this.basePath = `${this.API_BASE_URL}/job-shifts`;
    this.router = express.Router();
    this.router.use(this.basePath, authenticationMiddleware);
    this.initializeRoutes();
  }

  public getBasePath(): string {
    return this.basePath;
  }

  public initializeRoutes(): void {
    this.router.post(`${this.basePath}`, this.createJobBoard);
    this.router.get(`${this.basePath}`, identityMiddleware, this.getAllJobBoards);
    this.router.put(`${this.basePath}`, this.updateJobBoard);
  }

  private getAllJobBoards = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] [getAllJobBoards] Get all job shifts initiated`);

    try {
      const {
        obUserPsId,
        branchIds: userBranchIds,
        divisionIds: userDivisionIds,
        provinceCodes: userProvinceCodes,
      } = request.obUserIdentity;

      const {
        startDate,
        jobShiftId,
        shiftStatus,
        maxDays = '7',
        audienceLevel,
        adminView = 'disabled',
        skip,
        limit,
        search,
      }: {
        startDate?: Date;
        jobShiftId?: string;
        shiftStatus?: string;
        maxDays?: string;
        audienceLevel?: AudienceEnum;
        adminView?: string;
        skip?: string;
        limit?: string;
        search?: string;
      } = request.query;

      const makeFilter = (): FilterQuery<OBJobBoardSchemaType> => {
        let filter: FilterQuery<OBJobBoardSchemaType> = {};

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

      if (userBranchIds.includes('*')) {
        filters.$or.push({ branchIds: { $ne: [] } });
      }

      if (jobShiftId) {
        filters.jobShiftId = jobShiftId;
      }

      if (shiftStatus && shiftStatus !== 'All') {
        filters.shiftStatus = shiftStatus;
      }

      if (adminView === 'disabled') {
        const jobShiftStartDate = isValidDate(new Date(startDate)) ? new Date(startDate) : new Date();
        const jobShiftEndDate = +maxDays ? addDays(jobShiftStartDate, +maxDays) : addDays(new Date(), 14);

        filters.shiftStartsAt = {
          $gte: jobShiftStartDate,
        };

        filters.shiftEndsAt = {
          $lte: jobShiftEndDate,
        };
      }

      filters.isDeleted = false;

      if (search) {
        const searchRegex = new RegExp(search, 'i');
        filters.$or = [
          { jobShiftId: searchRegex },
          { 'shiftDetails.value': searchRegex },
          { 'shiftDetails.field': searchRegex },
        ];
      }

      const jobShiftsData = await jobBoardService.getAllJobBoards(
        transactionId,
        {
          userPsId: obUserPsId,
          branchIds: userBranchIds,
          divisionIds: userDivisionIds,
          provincialCodes: userProvinceCodes,
        },
        { ...filters },
        {
          limit: +limit || 10,
          skip: +skip || 0,
          sort: {
            shiftStartsAt: -1,
          },
        },
      );

      let branchIds = [];

      jobShiftsData.map((jobShifts) => {
        branchIds = [...branchIds, ...jobShifts.branchIds];
      });

      const branchList = await locationService.getAllBranchesByIds(transactionId, branchIds);

      const mappedJobShifts: JobBoardPayloadType[] = jobShiftsData.map((jobShifts) => {
        const branchObj = branchList.find((branch) => jobShifts.branchIds.includes(branch.branchId));

        return mapDbJobBoardToApiPayload(jobShifts, branchObj);
      });

      response.status(HttpStatusCode.OK).json({
        success: true,
        data: mappedJobShifts,
      });
    } catch (getErr) {
      logError(`[${transactionId}] [CONTROLLER] [getAllJobBoards] Get all job shifts failed`);

      next(getErr);
    }
  };

  private createJobBoard = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] [createJobBoard] Create job shifts initiated`);

    try {
      const payload: HTTPJobBoardInputType[] = request.body;

      const { employeePsId } = request.employeePingIdentity;

      const mappedPayload: OBJobBoardOperationType[] = payload.map((jobShift) => {
        const {
          shiftDate,
          startTime,
          endTime,
          shiftStartsAt,
          shiftEndsAt,
          expiresAt,
          priority,
          audienceLevel,
          branchIds,
          shiftStatus,
          shiftDetails,
          shiftAssignedToPsId,
        } = jobShift;

        return {
          shiftStartsAt: shiftStartsAt
            ? new Date(shiftStartsAt)
            : new Date(`${new Date(shiftDate).toLocaleDateString()}, ${startTime}`),
          shiftEndsAt: shiftEndsAt
            ? new Date(shiftEndsAt)
            : new Date(`${new Date(shiftDate).toLocaleDateString()}, ${endTime}`),
          priority,
          audienceLevel,
          branchIds,
          shiftStatus,
          shiftDetails,
          shiftAssignedToPsId,
          createdUserPsId: employeePsId,
          expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        };
      });

      logInfo(
        `[${transactionId}] [CONTROLLER] [createJobBoard] Create job shifts received payload ${JSON.stringify(
          payload,
        )}`,
      );

      const responseData = await jobBoardService.createMultipleJobBoard(transactionId, mappedPayload);

      logInfo(
        `[${transactionId}] [CONTROLLER] [createJobBoard] Create job shifts completed with response ${JSON.stringify(
          responseData,
        )}`,
      );

      response.status(HttpStatusCode.OK).json(responseData);
    } catch (createErr) {
      logError(`[${transactionId}] [CONTROLLER] [createJobBoard] Create job shifts failed`);

      next(createErr);
    }
  };

  private updateJobBoard = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] [updateJobBoard] Update job shifts initiated`);

    try {
      const payload: HttpPutUpdateJobBoard[] = request.body;

      const mappedPayload: Partial<OBJobBoardOperationType>[] = payload.map((jobShift) => {
        return mapJobBoardApiRequestToServiceRequest(jobShift);
      });

      logInfo(
        `[${transactionId}] [CONTROLLER] [updateJobBoard] Update job shifts received payload ${JSON.stringify(
          payload,
        )}`,
      );

      const responseData = await jobBoardService.updateMultipleJobBoards(transactionId, mappedPayload);

      logInfo(
        `[${transactionId}] [CONTROLLER] [updateJobBoard] Update job shifts completed with response ${JSON.stringify(
          responseData,
        )}`,
      );

      response.status(HttpStatusCode.OK).json(responseData);
    } catch (updateErr) {
      logError(`[${transactionId}] [CONTROLLER] [updateJobBoard] Update job shifts failed`);

      next(updateErr);
    }
  };
}
