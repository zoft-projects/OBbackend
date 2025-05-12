import { HttpStatusCode } from '@bayshore-healthcare/lib-error-middleware';
import { pingAuthMiddleware } from '@bayshore-healthcare/lib-ping-authentication-middleware';
import config from 'config';
import { NextFunction } from 'connect';
import express from 'express';
import { FilterQuery } from 'mongoose';
import multer from 'multer';
import { IAppConfig } from '../../config';
import {
  ActiveStateEnum,
  BranchFeaturesProvisionEnum,
  TempDataValueEnum,
  UserLevelEnum,
  VisitActionEnum,
  NoteTypeEnum,
} from '../../enums';
import { NotFoundError } from '../../errors/not_found_error';
import { ValidationError } from '../../errors/validation_error';
import { getLogger, logError, logInfo, logWarn } from '../../log/util';
import { identityMiddleware, qaInternalApiMiddleware, accessControlMiddlewareHOF } from '../../middlewares';
import {
  visitService,
  clientService,
  wellnessNoteService,
  locationService,
  tempDataService,
  userService,
  featureProvisioningService,
  cacheService,
} from '../../services';
import {
  VisitFromSystemType,
  OBWellnessNoteUpsertOperationType,
  OBWellnessNoteSchemaType,
  HttpPostCheckinType,
  HttpPostCheckoutType,
  VisitDetailPayloadType,
  ClientAddedEntitiesFromSystemType,
  VisitEmployeeAggregatedPayload,
  HttpPostCreateNoteType,
  FileBufferDataType,
} from '../../types';
import {
  addDays,
  isValidDate,
  subDays,
  startOfDay,
  endOfDay,
  mapAccessLevelToName,
  mapVisitSystemToVisitApiPayload,
  mapVisitToPreviousVisitApiPayload,
  mapVisitAndClientApiPayload,
  prefixOngoingVisit,
  differenceInDays,
  isSameDay,
  timeTrackStart,
  timeTrackEnd,
  getEffectiveBranchIds,
} from '../../utils';
import { BaseController } from '../base_controller';

const { name: environment }: { name: string } = config.get('Environment');
const logger = getLogger();

const authenticationMiddleware = pingAuthMiddleware({ logger });

const upload = multer({ storage: multer.memoryStorage() });

export class VisitController extends BaseController {
  public basePath: string;
  public router: express.Router;

  constructor(appConfig: IAppConfig) {
    super(appConfig.envConfig);
    this.basePath = `${this.API_BASE_URL}/visits`;
    this.router = express.Router();
    this.initializeRoutes();
  }

  public getBasePath(): string {
    return this.basePath;
  }

  public initializeRoutes(): void {
    // Visits listing endpoints
    // Get current and future visits
    this.router.get(
      `${this.basePath}`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([
        UserLevelEnum.FIELD_STAFF,
        UserLevelEnum.BRANCH_ADMIN,
        UserLevelEnum.ADMIN,
        UserLevelEnum.CONTROLLED_ADMIN,
      ]),
      this.asyncHandler(this.getVisitsByDates.bind(this)),
    );
    // Get older visits (currently filtered for only completed visits)
    this.router.get(
      `${this.basePath}/previous`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([
        UserLevelEnum.FIELD_STAFF,
        UserLevelEnum.BRANCH_ADMIN,
        UserLevelEnum.ADMIN,
        UserLevelEnum.CONTROLLED_ADMIN,
      ]),
      this.asyncHandler(this.getPreviousVisitsByDates.bind(this)),
    );
    // Admin pull wellness notes created by the caregivers
    this.router.get(
      `${this.basePath}/admin/notes`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.ADMIN, UserLevelEnum.SUPER_ADMIN]),
      this.asyncHandler(this.getWellnessNotesByBranchIds.bind(this)),
    );

    // Visit specific
    this.router.get(
      `${this.basePath}/:visitId/details`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF, UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      this.asyncHandler(this.getVisitDetailsByVisitId.bind(this)),
    );
    this.router.put(
      `${this.basePath}/wellness/client/:clientId`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF, UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      upload.array('files'),
      this.asyncHandler(this.storeClientWellnessImageInS3.bind(this)),
    );
    this.router.post(
      `${this.basePath}/:visitId/checkin`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF, UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      this.asyncHandler(this.visitCheckin.bind(this)),
    );
    this.router.delete(`${this.basePath}/wellness`, this.asyncHandler(this.removeWellnessImages.bind(this)));
    this.router.post(
      `${this.basePath}/:visitId/checkout`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF, UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      this.asyncHandler(this.visitCheckout.bind(this)),
    );
    this.router.post(
      `${this.basePath}/:visitId/reset`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF, UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      this.asyncHandler(this.visitReset.bind(this)),
    );
    /**
     * @deprecated should POST /:visitId/reset instead of PUT
     */
    this.router.put(
      `${this.basePath}/:visitId/reset`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF, UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      this.asyncHandler(this.visitReset.bind(this)),
    );
    this.router.post(
      `${this.basePath}/:visitId/notes`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([UserLevelEnum.FIELD_STAFF, UserLevelEnum.BRANCH_ADMIN, UserLevelEnum.SUPER_ADMIN]),
      this.asyncHandler(this.createVisitNote.bind(this)),
    );

    /**
     * QA support endpoints that works only on dev/staging environments
     */

    if (['development', 'staging'].includes(environment)) {
      this.router.post(
        `${this.basePath}/:visitId/checkin-qa`,
        qaInternalApiMiddleware,
        this.asyncHandler(this.qaVisitCheckin.bind(this)),
      );
      this.router.post(
        `${this.basePath}/:visitId/checkout-qa`,
        qaInternalApiMiddleware,
        this.asyncHandler(this.qaVisitCheckout.bind(this)),
      );
      this.router.post(
        `${this.basePath}/:visitId/reset-qa`,
        qaInternalApiMiddleware,
        this.asyncHandler(this.qaVisitReset.bind(this)),
      );
      this.router.put(
        `${this.basePath}/:visitId/reset-qa`,
        qaInternalApiMiddleware,
        this.asyncHandler(this.qaVisitReset.bind(this)),
      );
      this.router.post(
        `${this.basePath}/:visitId/notes-qa`,
        qaInternalApiMiddleware,
        this.asyncHandler(this.qaCreateVisitNote.bind(this)),
      );
    }

    // TODO: Deprecate use /admin/notes going forward
    this.router.get(
      `${this.basePath}/wellnessNotes`,
      authenticationMiddleware,
      identityMiddleware,
      accessControlMiddlewareHOF([
        UserLevelEnum.BRANCH_ADMIN,
        UserLevelEnum.ADMIN,
        UserLevelEnum.CONTROLLED_ADMIN,
        UserLevelEnum.SUPER_ADMIN,
      ]),
      this.asyncHandler(this.getWellnessNotesByBranchIds.bind(this)),
    );
  }

  // Read visit/shift data

  private getVisitsByDates = async (
    request: express.Request,
    response: express.Response<VisitEmployeeAggregatedPayload>,
    next: NextFunction,
  ) => {
    const transactionId = request.txId;
    const {
      displayName,
      obUserPsId,
      email,
      branchIds,
      accessLvl,
      assumedBranchIds = [],
      systemIdentifiers = [],
    } = request.obUserIdentity;
    const startTime = timeTrackStart();

    logInfo(`[${transactionId}] [CONTROLLER] [getVisitsByDates] Get visits initiated for psId: ${obUserPsId}`);

    try {
      const {
        startDate,
        maxDays,
        overrideEmpId,
        overrideTenantId,
        overrideSystemType,
      }: {
        startDate?: string;
        maxDays?: string;
        overrideEmpId?: string;
        overrideTenantId?: string;
        overrideSystemType?: string;
      } = request.query;

      const visitStartDate = isValidDate(new Date(startDate)) ? new Date(startDate) : subDays(new Date(), 1);

      const maxDaysInFuture = parseInt(maxDays, 10) || 21;

      const visitEndDate = addDays(visitStartDate, maxDaysInFuture);

      const [effectiveBranchId] = getEffectiveBranchIds(assumedBranchIds, branchIds);

      // Procura/Alayacare/Calcom will be supported together in the future
      const [isAlayacareUser, isCalcomSupported, hasShorterCheckinWindow] = await Promise.all([
        featureProvisioningService.getProvisionForBranchId(
          transactionId,
          BranchFeaturesProvisionEnum.AlayacareCard,
          effectiveBranchId,
        ),
        featureProvisioningService.getProvisionForBranchId(
          transactionId,
          BranchFeaturesProvisionEnum.ShiftsCalcomSystemSupport,
          effectiveBranchId,
        ),
        featureProvisioningService.getProvisionForBranchId(
          transactionId,
          BranchFeaturesProvisionEnum.ShiftsShorterCheckinWindow,
          effectiveBranchId,
        ),
      ]);

      // TODO: Will eventually be removed when this is no longer relevant
      if (mapAccessLevelToName(accessLvl) === UserLevelEnum.FIELD_STAFF && isAlayacareUser) {
        response.status(HttpStatusCode.OK).send({
          employeeDetail: {
            employeeId: '',
            employeeEmail: email,
            employeeName: '',
            employeePsId: obUserPsId,
            tenantId: '',
            employeeTimezone: '',
          },
          visits: [],
          isAlayacareVariant: true,
        });

        logInfo(`[${transactionId}] [CONTROLLER] [getVisitsByDates] Alayacare branch found`);

        return;
      }

      let userSystemIdentifiers: {
        empSystemId: string;
        systemName: string;
        tenantId: string;
        designation?: string;
      }[] = [];

      if (overrideEmpId && overrideTenantId) {
        userSystemIdentifiers.push({
          empSystemId: overrideEmpId,
          systemName: overrideSystemType || 'procura',
          tenantId: overrideTenantId,
        });
      } else {
        const procuraIdentifiers = systemIdentifiers.filter(({ systemName }) => systemName === 'procura');
        const calcomIdentifiers = isCalcomSupported
          ? systemIdentifiers.filter(({ systemName }) => systemName === 'calcom')
          : [];

        userSystemIdentifiers = [...procuraIdentifiers, ...calcomIdentifiers];
      }

      if (userSystemIdentifiers.length === 0) {
        response.status(HttpStatusCode.OK).send({
          employeeDetail: {
            employeeId: '',
            employeeEmail: email,
            employeeName: '',
            employeePsId: obUserPsId,
            tenantId: '',
            employeeTimezone: '',
          },
          visits: [],
        });

        logInfo(`[${transactionId}] [CONTROLLER] [getVisitsByDates] No scheduling system identifiers available`);

        return;
      }

      const aggregatedVisitQueryResults = await Promise.allSettled(
        userSystemIdentifiers.map(({ empSystemId, tenantId, systemName }) =>
          visitService.getSystemVisitsByDates(transactionId, {
            employeeId: empSystemId,
            tenantId,
            systemType: systemName,
            startDate: visitStartDate,
            endDate: visitEndDate,
          }),
        ),
      );

      let aggregatedVisits: VisitFromSystemType[] = [];

      aggregatedVisitQueryResults.forEach((visitQueryResult) => {
        if (visitQueryResult.status === 'fulfilled') {
          // This is a genuine use case to filter out visits which has an associated plannerId
          // Having plannerId means the visit is still under planning and not finalized
          const visitsWithoutPlanners = visitQueryResult.value.filter(({ plannerId }) => !plannerId);

          aggregatedVisits = [...aggregatedVisits, ...visitsWithoutPlanners];
        }
      });

      let currentTenantId: string = null;
      let currentEmpSystemId: string = null;
      let currentEmpSystemType: string = null;
      const ongoingVisitIdSet = new Set<string>();
      const completedVisitSet = new Set<string>();
      const actionEligibleVisitSet = new Set<string>();
      const visitTenantMapReference = new Map<string, string>();
      const visitMapReference = new Map<string, VisitFromSystemType>();

      aggregatedVisits.forEach((visit) => {
        visitTenantMapReference.set(visit.visitId, visit.tenantId);
        visitMapReference.set(visit.visitId, visit);

        if (!currentTenantId && visit.tenantId) {
          currentTenantId = visit.tenantId;
          [currentEmpSystemId] = visit.scheduledEmployeeIds;
        }

        if (visit.checkInTime && !visit.checkOutTime) {
          ongoingVisitIdSet.add(visit.visitId);
          currentEmpSystemType = visit.systemType;
        }

        if (visit.checkInTime && visit.checkOutTime) {
          completedVisitSet.add(visit.visitId);
        }

        if (
          new Date(visit.startDateTime).getTime() > startOfDay(subDays(new Date(), 1)).getTime() &&
          new Date(visit.startDateTime).getTime() < addDays(new Date(), 1).getTime()
        ) {
          actionEligibleVisitSet.add(visit.visitId);
        }
      });

      const canMultipleCheckin = await featureProvisioningService.getProvisionForBranchId(
        transactionId,
        BranchFeaturesProvisionEnum.ShiftsMultipleCheckinSupport,
        effectiveBranchId,
        accessLvl,
      );
      if (canMultipleCheckin) {
        logInfo(
          `[${transactionId}] [CONTROLLER] [getVisitsByDates] Multiple Check-in option enabled for psId: ${obUserPsId} and branchId: ${effectiveBranchId}`,
        );
      }

      const ongoingVisitIds = new Set<string>();
      const recentlyCheckedOutVisitIds = new Set<string>(); // This is for ui purpose since pipeline downstream sync can be slower

      const uniqueClientTenantIds = new Map<string, { clientId: string; tenantId: string }>();

      aggregatedVisits.forEach(({ clientId, tenantId }) => {
        if (clientId && tenantId) {
          uniqueClientTenantIds.set(`${clientId}_${tenantId}`, { clientId, tenantId });
        }
      });

      const aggregatedClients =
        uniqueClientTenantIds.size > 0
          ? await clientService.getClientDetailByClientAndTenantIds(transactionId, [...uniqueClientTenantIds.values()])
          : [];

      if (ongoingVisitIdSet.size > 0) {
        const ongoingVisitIdSetByWriteback = new Set<string>();
        const completedVisitIdSetByWriteback = new Set<string>();
        const aggregatedAttemptedEntries = await Promise.allSettled(
          [...ongoingVisitIdSet].map((ongoingVisitId) =>
            visitService.getWrittenVisitByVisitIdAndTenantId(transactionId, request.headers.authorization, {
              visitId: ongoingVisitId,
              tenantId: visitTenantMapReference.get(ongoingVisitId) ?? '',
              systemType: currentEmpSystemType || 'procura',
            }),
          ),
        );

        aggregatedAttemptedEntries.forEach((aggregatedAttemptedEntry) => {
          if (aggregatedAttemptedEntry.status === 'fulfilled') {
            if (aggregatedAttemptedEntry.value.visitStatus === 'Open') {
              ongoingVisitIdSetByWriteback.add(aggregatedAttemptedEntry.value.visitId);

              return;
            }
            if (aggregatedAttemptedEntry.value.visitStatus === 'Closed') {
              completedVisitIdSetByWriteback.add(aggregatedAttemptedEntry.value.visitId);
            }
          }
        });

        [...ongoingVisitIdSet].forEach((ongoingVisitIdInSystem) => {
          if (!completedVisitIdSetByWriteback.has(ongoingVisitIdInSystem)) {
            ongoingVisitIds.add(ongoingVisitIdInSystem);
          }
        });
      }

      if (actionEligibleVisitSet.size > 0) {
        const [cachedCheckinHash, cachedCheckoutHash, cachedProcuraCheckoutHash] = await Promise.all([
          cacheService.batchRetrieve(
            transactionId,
            [...actionEligibleVisitSet.values()].map((visitId) => ({
              serviceName: 'checkedInStatus',
              identifier: `${visitId}_${visitTenantMapReference.get(visitId) ?? 'UNKNOWN_TENANT'}`,
            })),
          ),
          cacheService.batchRetrieve(
            transactionId,
            [...actionEligibleVisitSet.values()].map((visitId) => ({
              serviceName: 'checkedOutStatus',
              identifier: `${visitId}_${visitTenantMapReference.get(visitId) ?? 'UNKNOWN_TENANT'}`,
            })),
          ),
          cacheService.batchRetrieve(
            transactionId,
            [...actionEligibleVisitSet.values()].map((visitId) => {
              const matchingVisit = visitMapReference.get(visitId);

              return {
                serviceName: 'checkedOutStatus',
                identifier: `cvid_${matchingVisit?.cvid}_day_${new Date(
                  matchingVisit?.startDateTime,
                ).getDate()}_emp_${currentEmpSystemId}_tenant_${matchingVisit?.tenantId}`,
              };
            }),
          ),
        ]);

        actionEligibleVisitSet.forEach((visitId) => {
          if (cachedCheckinHash[`${visitId}_${visitTenantMapReference.get(visitId) ?? 'UNKNOWN_TENANT'}`]) {
            ongoingVisitIds.add(visitId);
          }
          if (cachedCheckoutHash[`${visitId}_${visitTenantMapReference.get(visitId) ?? 'UNKNOWN_TENANT'}`]) {
            recentlyCheckedOutVisitIds.add(visitId);
          }
          const matchingVisit = visitMapReference.get(visitId);
          if (
            cachedProcuraCheckoutHash[
              `cvid_${matchingVisit?.cvid}_day_${new Date(
                matchingVisit?.startDateTime,
              ).getDate()}_emp_${currentEmpSystemId}_tenant_${matchingVisit?.tenantId}`
            ]
          ) {
            recentlyCheckedOutVisitIds.add(visitId);
          }
        });
      }

      const visitsWithClients = mapVisitSystemToVisitApiPayload(aggregatedVisits, aggregatedClients, {
        ongoingVisitIds: [...ongoingVisitIds],
        completedVisitIds: [...recentlyCheckedOutVisitIds],
        canDoMultipleCheckin: canMultipleCheckin,
        hasShorterCheckinWindow,
      });

      // Sorted the visits in the ascending order
      const visitsSortedByDate = [...visitsWithClients].sort((visitOrder1, visitOrder2) => {
        return new Date(visitOrder1.visitStartDate).getTime() - new Date(visitOrder2.visitStartDate).getTime();
      });

      const lastVisitDate =
        visitsSortedByDate.length > 0
          ? new Date(visitsSortedByDate[visitsSortedByDate.length - 1].visitStartDate)
          : visitEndDate;

      // TODO: Remove bottom condition after testing
      const currentVisits = request.query.ignoreStatus
        ? visitsSortedByDate.filter((visit) => visit.actionStatus !== (request.query.ignoreStatus as VisitActionEnum))
        : visitsSortedByDate;

      // TODO: Move the value to config
      const canSupportPagination = differenceInDays(lastVisitDate, new Date()) < 90;
      const canSupportPaginationWithNextStartDate = differenceInDays(visitEndDate, new Date()) < 90;

      const [firstMatchingSystem] = userSystemIdentifiers;

      response.status(HttpStatusCode.OK).send({
        employeeDetail: {
          employeeId: currentEmpSystemId ?? firstMatchingSystem?.empSystemId,
          tenantId: currentTenantId ?? firstMatchingSystem?.tenantId,
          employeePsId: overrideEmpId ? '' : obUserPsId,
          employeeName: overrideEmpId ? '' : displayName,
          employeeEmail: overrideEmpId ? '' : email,
          employeeTimezone: '',
        },
        visits: currentVisits,
        lastVisitDate: canSupportPagination ? lastVisitDate.toISOString() : null,
        nextStartDate: canSupportPaginationWithNextStartDate ? visitEndDate?.toISOString() : null,
      });

      const timeTaken = timeTrackEnd(startTime);

      logInfo(
        `[${transactionId}] [CONTROLLER] [getVisitsByDates] completed SUCCESSFULLY for psId: ${obUserPsId}, timeTaken: ${timeTaken}`,
      );
    } catch (getErr) {
      logError(`[${transactionId}] [CONTROLLER] [getVisitsByDates] Api FAILED, reason: ${getErr.message}`);

      next(getErr);
    }
  };

  private storeClientWellnessImageInS3 = async (
    request: express.Request & { files: Express.Multer.File[] },
    response: express.Response,
    next: NextFunction,
  ) => {
    const transactionId = request.txId;

    const { obUserPsId } = request.obUserIdentity;
    const {
      clientId,
    }: {
      clientId: string;
    } = request.body;

    logInfo(
      `[${transactionId}] [CONTROLLER] storeClientWellnessImageInS3 for client ${clientId} by user ${obUserPsId}`,
    );

    try {
      if (!clientId) {
        throw new Error('Missing required parameters in request');
      }
      if (!request.files || (Array.isArray(request.files) && request.files.length === 0)) {
        throw new Error('No image file sent with upload request');
      }

      const [file] = request.files;
      const imageBuffer: FileBufferDataType = {
        fieldName: file.fieldname,
        originalName: file.originalname,
        encoding: file.encoding,
        mimetype: file.mimetype,
        size: file.size,
        buffer: file.buffer,
      };

      const presignedUrl = await clientService.storeClientWellnessImageInS3(transactionId, {
        user: obUserPsId,
        clientId,
        imageBuffer,
      });

      logInfo(
        `[${transactionId}] [CONTROLLER] storeClientWellnessImageInS3 stored wellness image successfully for client ${clientId} by user ${obUserPsId}`,
      );

      response.status(HttpStatusCode.OK).json({ message: 'Image stored', presignedUrl });
    } catch (storeErr) {
      logError(
        `[${transactionId}] [CONTROLLER] storeClientWellnessImageInS3 Storing image failed, reason: ${storeErr.message}`,
      );

      next(storeErr);
    }
  };

  private removeWellnessImages = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    logInfo(`[${transactionId}] [CONTROLLER] removeWellnessImages for the past 24 hours`);

    try {
      const totalDeleted = await clientService.removeWellnessImages(transactionId);

      logInfo(`[${transactionId}] [CONTROLLER] removeWellnessImages deleted for past 24 hours`);

      response.status(HttpStatusCode.OK).json({ message: 'Success', totalDeleted });
    } catch (deleteErr) {
      logError(
        `[${transactionId}] [CONTROLLER] removeWellnessImages deleting images failed, reason: ${deleteErr.message}`,
      );

      next(deleteErr);
    }
  };

  private getPreviousVisitsByDates = async (
    request: express.Request,
    response: express.Response,
    next: NextFunction,
  ) => {
    const transactionId = request.txId;
    const {
      displayName,
      obUserPsId,
      email,
      branchIds,
      assumedBranchIds,
      systemIdentifiers = [],
    } = request.obUserIdentity;
    const startTime = timeTrackStart();

    logInfo(
      `[${transactionId}] [CONTROLLER] [getPreviousVisitsByDates] Get previous visits initiated for psId: ${obUserPsId}`,
    );

    try {
      const {
        startDate,
        maxDays,
        overrideEmpId,
        overrideTenantId,
        overrideSystemType,
      }: {
        startDate?: string;
        maxDays?: string;
        overrideEmpId?: string;
        overrideTenantId?: string;
        overrideSystemType?: string;
      } = request.query;

      const visitEndDate = isValidDate(new Date(startDate)) ? endOfDay(new Date(startDate)) : endOfDay(new Date());

      const maxDaysInPast = parseInt(maxDays, 10) || 30;

      const visitStartDate = subDays(visitEndDate, maxDaysInPast);

      const [effectiveBranchId] = getEffectiveBranchIds(assumedBranchIds, branchIds);

      let userSystemIdentifiers: {
        empSystemId: string;
        systemName: string;
        tenantId: string;
        designation?: string;
      }[] = [];

      if (overrideEmpId && overrideTenantId) {
        userSystemIdentifiers.push({
          empSystemId: overrideEmpId,
          systemName: overrideSystemType || 'procura',
          tenantId: overrideTenantId,
        });
      } else {
        const isCalcomSupported = await featureProvisioningService.getProvisionForBranchId(
          transactionId,
          BranchFeaturesProvisionEnum.ShiftsCalcomSystemSupport,
          effectiveBranchId,
        );
        const procuraIdentifiers = systemIdentifiers.filter(({ systemName }) => systemName === 'procura');
        const calcomIdentifiers = isCalcomSupported
          ? systemIdentifiers.filter(({ systemName }) => systemName === 'calcom')
          : [];

        userSystemIdentifiers = [...procuraIdentifiers, ...calcomIdentifiers];
      }

      if (!userSystemIdentifiers.length) {
        response.status(HttpStatusCode.OK).send({
          employeeDetail: {
            employeeId: '',
            employeeEmail: email,
            employeeName: '',
            employeePsId: obUserPsId,
            tenantId: '',
            employeeTimezone: '',
          },
          previousVisits: [],
        });

        logInfo(
          `[${transactionId}] [CONTROLLER] [getPreviousVisitsByDates] No scheduling system identifiers available`,
        );

        return;
      }

      // Pull Visits through Data Pipeline
      const aggregatedVisitQueryResults = await Promise.allSettled(
        userSystemIdentifiers.map(({ empSystemId, systemName, tenantId }) =>
          visitService.getSystemVisitsByDates(transactionId, {
            employeeId: empSystemId,
            tenantId,
            systemType: systemName,
            startDate: visitStartDate,
            endDate: visitEndDate,
          }),
        ),
      );

      let aggregatedVisits: VisitFromSystemType[] = [];

      aggregatedVisitQueryResults.forEach((visitQueryResult) => {
        if (visitQueryResult.status === 'fulfilled') {
          aggregatedVisits = [...aggregatedVisits, ...visitQueryResult.value];
        }
      });

      const visitedClientMap = new Map<string, { clientId: string; tenantId: string }>();

      aggregatedVisits.forEach((visit) => {
        visitedClientMap.set(`${visit.clientId}_${visit.tenantId}`, {
          clientId: visit.clientId,
          tenantId: visit.tenantId,
        });
      });

      const visitedClients = await clientService.getClientDetailByClientAndTenantIds(transactionId, [
        ...visitedClientMap.values(),
      ]);

      const translatedPreviousVisits = mapVisitToPreviousVisitApiPayload(aggregatedVisits, visitedClients, displayName);
      const sortedPreviousVisitsInDesc = [...translatedPreviousVisits].sort((visitOrder1, visitOrder2) => {
        return new Date(visitOrder2.visitStartDate).getTime() - new Date(visitOrder1.visitStartDate).getTime();
      });

      const [firstMatchingSystem] = userSystemIdentifiers;

      let lastVisitDate =
        sortedPreviousVisitsInDesc.length > 0
          ? new Date(sortedPreviousVisitsInDesc[sortedPreviousVisitsInDesc.length - 1].visitStartDate)
          : visitStartDate;

      if (isSameDay(lastVisitDate, visitEndDate)) {
        lastVisitDate = subDays(lastVisitDate, 1);
      }

      // TODO: Move the value to config
      const canSupportPagination = differenceInDays(new Date(), lastVisitDate) < 90;
      const canSupportPaginationWithPreviousStartDate = differenceInDays(new Date(), visitStartDate) < 90;

      response.status(HttpStatusCode.OK).send({
        employeeDetail: {
          employeeId: firstMatchingSystem.empSystemId,
          tenantId: firstMatchingSystem.tenantId,
          employeePsId: overrideEmpId ? '' : obUserPsId,
          employeeName: overrideEmpId ? '' : displayName,
          employeeEmail: overrideEmpId ? '' : email,
          employeeTimezone: '',
        },
        previousVisits: sortedPreviousVisitsInDesc,
        lastVisitDate: canSupportPagination ? lastVisitDate.toISOString() : null,
        previousStartDate: canSupportPaginationWithPreviousStartDate ? visitStartDate.toISOString() : null,
      });

      const timeTaken = timeTrackEnd(startTime);

      logInfo(
        `[${transactionId}] [CONTROLLER] [getPreviousVisitsByDates] completed SUCCESSFULLY for psId: ${obUserPsId}, timeTaken: ${timeTaken}`,
      );
    } catch (getErr) {
      logError(`[${transactionId}] [CONTROLLER] [getPreviousVisitsByDates] Api FAILED, reason: ${getErr.message}`);

      next(getErr);
    }
  };

  private getVisitDetailsByVisitId = async (
    request: express.Request,
    response: express.Response<VisitDetailPayloadType>,
    next: NextFunction,
  ) => {
    const transactionId = request.txId;
    const startTime = timeTrackStart();
    const { obUserPsId, systemIdentifiers, branchIds, assumedBranchIds } = request.obUserIdentity;

    logInfo(
      `[${transactionId}] [CONTROLLER] [getVisitDetailsByVisitId] Get visit details initiated for psId: ${obUserPsId}`,
    );

    try {
      const { visitId }: { visitId?: string } = request.params;
      const {
        overridePsId,
        cvid,
        tenantId: tenantIdFromRequest,
        // TODO: Ask frontend to send the expected start/end date instead of using arbitrary date
        visitStartDate: visitStartDateStr,
        visitEndDate: visitEndDateStr,
      }: {
        overridePsId?: string;
        cvid?: string;
        tenantId?: string;
        visitStartDate?: string;
        visitEndDate?: string;
      } = request.query;

      const [effectiveBranchId] = getEffectiveBranchIds(assumedBranchIds, branchIds);

      const isCalcomSupported = await featureProvisioningService.getProvisionForBranchId(
        transactionId,
        BranchFeaturesProvisionEnum.ShiftsCalcomSystemSupport,
        effectiveBranchId,
      );

      const procuraIdentifiers = systemIdentifiers.filter(({ systemName }) => systemName === 'procura');
      const calcomIdentifiers = isCalcomSupported
        ? systemIdentifiers.filter(({ systemName }) => systemName === 'calcom')
        : [];

      const userSystemIdentifiers = [...procuraIdentifiers, ...calcomIdentifiers];

      let visitRequestParams = userSystemIdentifiers.map(({ empSystemId, tenantId, systemName }) => ({
        cvid,
        employeeId: empSystemId,
        visitId,
        tenantId,
        systemType: systemName,
        expectedStartDate:
          visitStartDateStr && isValidDate(new Date(visitStartDateStr)) ? new Date(visitStartDateStr) : new Date(),
        expectedEndDate:
          visitEndDateStr && isValidDate(new Date(visitEndDateStr)) ? new Date(visitEndDateStr) : new Date(),
      }));

      if (overridePsId) {
        const overriddenProcuraEmployees = await userService.getMultipleProcuraDetailFromEmployeeService(
          transactionId,
          overridePsId,
        );

        visitRequestParams = overriddenProcuraEmployees.map(({ employeeId, tenantId, systemType }) => ({
          cvid,
          employeeId,
          visitId,
          tenantId,
          systemType,
          expectedStartDate: visitStartDateStr ? new Date(visitStartDateStr) : new Date(),
          expectedEndDate: visitEndDateStr ? new Date(visitEndDateStr) : new Date(),
        }));
      }

      if (tenantIdFromRequest) {
        visitRequestParams = visitRequestParams.filter(({ tenantId }) => tenantId === tenantIdFromRequest);
      }

      logInfo(
        `[${transactionId}] [CONTROLLER] [getVisitDetailsByVisitId] Visit Details requested for psId: ${
          overridePsId ?? obUserPsId
        } with params ${JSON.stringify(visitRequestParams)}`,
      );

      const [visitQueryResult, prevVisitResult] = await Promise.allSettled([
        visitService.getMatchingVisitForEmployeeIdsAndTenantIds(transactionId, visitRequestParams),
        visitService.getWrittenVisitByVisitIdAndTenantId(transactionId, request.headers.authorization, {
          visitId,
          systemType: 'procura',
          tenantId: tenantIdFromRequest,
        }),
      ]);

      if (visitQueryResult.status === 'rejected') {
        throw new NotFoundError('Visit not found in the system');
      }

      const visit = visitQueryResult.value;

      const [clientResolution, clientAdditionalDetailResolution] = await Promise.allSettled([
        clientService.getClientDetailByClientAndTenantIds(transactionId, [
          {
            clientId: visit.clientId,
            tenantId: visit.tenantId,
          },
        ]),
        clientService.getClientAdditionalEntitiesByClientAndTenantIds(transactionId, [
          {
            clientId: visit.clientId,
            tenantId: visit.tenantId,
          },
        ]),
      ]);

      if (clientResolution.status === 'rejected') {
        throw new NotFoundError('Matching client for visit not found in the system');
      }

      const [client] = clientResolution.value;
      let clientAdditionalDetails: ClientAddedEntitiesFromSystemType;

      if (clientAdditionalDetailResolution.status === 'fulfilled') {
        [clientAdditionalDetails] = clientAdditionalDetailResolution.value;
      } else {
        logError(
          `[${transactionId}] [CONTROLLER] [getVisitDetailsByVisitId] Client additional details ERROR, reason: ${clientAdditionalDetailResolution.reason}`,
        );
      }

      const [employeeId] = visit.scheduledEmployeeIds;

      logInfo(
        `[${transactionId}] [CONTROLLER] [getVisitDetailsByVisitId] Client additional details: ${JSON.stringify(
          clientAdditionalDetails ?? null,
        )}`,
      );

      const mappedVisitDetailPayload = mapVisitAndClientApiPayload(employeeId, {
        visit,
        client,
        clientAdditionalDetails,
        previousVisitWriteEntry: prevVisitResult.status === 'fulfilled' ? prevVisitResult.value : undefined,
      });

      const timeTaken = timeTrackEnd(startTime);

      logInfo(
        `[${transactionId}] [CONTROLLER] [getVisitDetailsByVisitId] Get visit details SUCCESSFUL for psId: ${obUserPsId}, timeTaken: ${timeTaken}`,
      );

      response.status(HttpStatusCode.OK).json(mappedVisitDetailPayload);
    } catch (getErr) {
      logError(
        `[${transactionId}] [CONTROLLER] [getVisitDetailsByVisitId] FAILED for psId: ${obUserPsId}, reason: ${getErr.message}`,
      );

      next(getErr);
    }
  };

  private getWellnessNotesByBranchIds = async (
    request: express.Request,
    response: express.Response,
    next: NextFunction,
  ) => {
    const transactionId = request.txId;
    const { noteType }: { noteType?: string } = request.query;
    const { branchIds, accessLvl } = request.obUserIdentity;

    logInfo(`[${transactionId}] [CONTROLLER] [getWellnessNotesByBranchIds] Get wellness notes initiated`);

    try {
      if (!Array.isArray(branchIds) || branchIds.length === 0 || (noteType && noteType !== 'WellnessNotes')) {
        throw new Error('Invalid or missing branch IDs for the logged-in user');
      }
      const accessLevelName = mapAccessLevelToName(accessLvl);

      if (accessLevelName !== UserLevelEnum.BRANCH_ADMIN) {
        throw new Error('Wellness note feature is only available for branch admins');
      }

      const {
        limit,
        skip,
        sortField,
        sortOrder,
        search,
      }: {
        limit?: string;
        skip?: string;
        sortField?: string;
        sortOrder?: 'asc' | 'desc';
        search?: string;
      } = request.query;

      const filters: FilterQuery<OBWellnessNoteSchemaType> = {
        branchId: { $in: branchIds },
      };

      const actualLimit = +limit || 100;
      const actualSkip = +skip || 0;

      const options = {
        limit: actualLimit,
        skip: actualSkip,
        sortField,
        sortOrder,
        search,
      };

      logInfo(
        `[${transactionId}] [CONTROLLER] [getWellnessNotesByBranchIds] Query requested for filters: ${JSON.stringify(
          filters,
        )}, options: ${JSON.stringify(options)}`,
      );

      const branches = await locationService.getAllBranchesByIds(transactionId, branchIds);
      const branchIdsSet = new Set(branchIds);

      const branchDetailsMap: Record<string, string> = {};
      branches.forEach((branch) => {
        const { branchId, branchName } = branch;
        if (branchIdsSet.has(branchId)) {
          branchDetailsMap[branchId] = branchName;
        }
      });

      const wellnessNotes = await wellnessNoteService.getWellnessNotesByBranchIds(transactionId, branchIds, options);

      const formattedNotes = wellnessNotes.map((wellnessNote) => {
        const branchName = branchDetailsMap[wellnessNote.branchId] || '';

        return {
          id: wellnessNote.id,
          cvid: wellnessNote.cvid,
          employeeName: wellnessNote.employeeName,
          clientDisplayName: wellnessNote.clientDisplayName,
          visitDate: wellnessNote.checkoutAt,
          branchName,
          wellnessNotes: wellnessNote.note,
        };
      });

      response.status(HttpStatusCode.OK).json(formattedNotes);
    } catch (error) {
      logError(
        `[${transactionId}] [CONTROLLER] [getWellnessNotesByBranchIds] Failed to retrieve wellness notes: ${error.message}`,
      );
      next(error);
    }
  };

  // Writeback for visit/shift

  private visitCheckin = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;
    const startTime = timeTrackStart();
    const {
      obUserPsId,
      displayName,
      email,
      branchIds,
      assumedBranchIds,
      systemIdentifiers = [],
    } = request.obUserIdentity;
    const requestData: HttpPostCheckinType = request.body;

    logInfo(
      `[${transactionId}] [CONTROLLER] [visitCheckin] Visit checkin initiated for employeePsId: ${obUserPsId}, visitId: ${
        requestData.visitId
      }, params: ${JSON.stringify(requestData)}`,
    );

    try {
      if (!requestData.visitId || !requestData.tenantId || !requestData.cvid || !requestData.deviceTime) {
        throw new ValidationError('Please provide required fields');
      }

      const [effectiveBranchId] = getEffectiveBranchIds(assumedBranchIds, branchIds);

      const [isCalcomSupported, shouldRedirectProgressNote] = await Promise.all([
        featureProvisioningService.getProvisionForBranchId(
          transactionId,
          BranchFeaturesProvisionEnum.ShiftsCalcomSystemSupport,
          effectiveBranchId,
        ),
        featureProvisioningService.getProvisionForBranchId(
          transactionId,
          BranchFeaturesProvisionEnum.ShiftsProgressNotePrivateWrite,
          effectiveBranchId,
        ),
      ]);

      const procuraIdentifiers = systemIdentifiers.filter(({ systemName }) => systemName === 'procura');
      const calcomIdentifiers = isCalcomSupported
        ? systemIdentifiers.filter(({ systemName }) => systemName === 'calcom')
        : [];

      const userSystemIdentifiers = [...procuraIdentifiers, ...calcomIdentifiers];

      const visitRequestParams = userSystemIdentifiers.map(({ empSystemId, tenantId, systemName }) => ({
        employeeId: empSystemId,
        visitId: requestData.visitId,
        tenantId,
        systemType: systemName,
        cvid: requestData.cvid,
        expectedStartDate: new Date(),
        expectedEndDate: new Date(),
      }));

      const visit = await visitService.getMatchingVisitForEmployeeIdsAndTenantIds(transactionId, visitRequestParams);

      const [currentEmployeeId] = visit.scheduledEmployeeIds;

      const geo =
        requestData.geo?.latitude && requestData.geo?.longitude
          ? {
              latitude: `${requestData.geo.latitude}`,
              longitude: `${requestData.geo.longitude}`,
            }
          : undefined;

      const { cvid: completedCvid, isTimedOut } = await visitService.checkin(transactionId, {
        cvid: visit.cvid,
        visitId: visit.visitId,
        tenantId: visit.tenantId,
        clientId: visit.clientId,
        createdBy: displayName,
        employeeId: currentEmployeeId,
        systemType: visit.systemType,
        caregiverEmail: email,
        checkinTime: requestData.deviceTime,
        clientPsId: visit.clientPsId,
        lateReason: requestData.lateReason,
        geo,
      });

      let responseMessage = `Checked in to ${completedCvid} Successfully`;

      if (isTimedOut) {
        responseMessage = `Your shift ${completedCvid} is submitted for checkin, please check back later`;
      } else if (requestData.progressNote) {
        responseMessage = `You've successfully checked in to ${completedCvid} and submitted progress notes.`;
      }

      response.status(HttpStatusCode.OK).json({
        title: responseMessage,
        message: responseMessage,
        payload: requestData,
        actionStatus: isTimedOut ? 'pending' : 'success',
      });

      const [client] = await clientService
        .getClientDetailByClientAndTenantIds(transactionId, [
          {
            clientId: visit.clientId,
            tenantId: visit.tenantId,
          },
        ])
        .catch(() => null); // Silent fail

      if (requestData.progressNote && !client?.isAttendance) {
        let modifiedSubject = `Progress Note for CVID ${visit.cvid} by ${displayName}`;

        if (requestData.progressNoteSubject) {
          const matchingEmployeeSystem = userSystemIdentifiers.find(
            ({ empSystemId, tenantId }) => empSystemId === currentEmployeeId && tenantId === visit.tenantId,
          );

          modifiedSubject = `${requestData.progressNoteSubject.trim()} - ${
            matchingEmployeeSystem?.designation ? `[${matchingEmployeeSystem.designation}]` : ''
          } [${displayName}]`;
        }

        await visitService
          .createVisitNote(transactionId, {
            visitId: visit.visitId,
            clientId: visit.clientId,
            employeeId: currentEmployeeId,
            createdBy: displayName,
            tenantId: visit.tenantId,
            noteForBranch: {
              content: requestData.progressNote,
              subject: modifiedSubject.slice(0, 80), // TODO: procura requirement but cleanup later
              noteType: shouldRedirectProgressNote
                ? NoteTypeEnum.PrivateProgressNotes
                : NoteTypeEnum.ClientConditionUpdate, // TODO: Private may use different NoteType
            },
          })
          .catch(() => null);
      }

      const timeTaken = timeTrackEnd(startTime);

      logInfo(
        `[${transactionId}] [CONTROLLER] [visitCheckin] SUCCESSFUL (ASYNC) for employeePsId: ${obUserPsId}, visitId: ${visit.visitId}, timeTaken: ${timeTaken}`,
      );

      await cacheService.persist(transactionId, {
        serviceName: 'checkedInStatus',
        identifier: `${visit.visitId}_${visit.tenantId}`,
        data: { employeeId: currentEmployeeId, visitId: visit.visitId, tenantId: visit.tenantId },
        expires: '7d',
      });

      // TODO check to see if this can be stored in user collection
      await tempDataService.addTempData(
        transactionId,
        {
          primaryIdentifier: prefixOngoingVisit(obUserPsId),
          valueType: TempDataValueEnum.Visit,
          payload: {
            visitId: visit.visitId,
            tenantId: visit.tenantId,
            cvid: visit.cvid,
          },
          valueStatus: ActiveStateEnum.Pending,
        },
        {
          shouldOverride: true,
        },
      );
    } catch (checkinErr) {
      logError(
        `[${transactionId}] [CONTROLLER] [visitCheckin] FAILED for employeePsId: ${obUserPsId}, visitId: ${requestData.visitId}, tenantId: ${requestData.tenantId}, reason: ${checkinErr.message}`,
      );

      // Offline mode should continue execution
      if (request.query.mode === 'offline') {
        logError(
          `[${transactionId}] [CONTROLLER] [visitCheckin] Caching in temp for employeePsId: ${obUserPsId}, visitId: ${requestData.visitId}, tenantId: ${requestData.tenantId}`,
        );

        await visitService.storeFailedCheckInOutInTemp(
          transactionId,
          {
            cvid: requestData.cvid,
            mode: 'checkin',
            psId: obUserPsId,
            tenantId: requestData.tenantId,
          },
          requestData,
        );

        response.status(HttpStatusCode.OK).json({
          message: 'We encountered some unexpected behavior with the checkin, we will look into this issue!',
          payload: requestData,
          actionStatus: 'pending',
        });

        return;
      }

      next(checkinErr);
    }
  };

  private visitCheckout = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;
    const startTime = timeTrackStart();
    const {
      obUserPsId,
      displayName,
      email,
      branchIds,
      assumedBranchIds,
      systemIdentifiers = [],
    } = request.obUserIdentity;
    const requestData: HttpPostCheckoutType = request.body;
    let responded = false;

    logInfo(
      `[${transactionId}] [CONTROLLER] [visitCheckout] Visit checkout initiated for employeePsId: ${obUserPsId}, visitId: ${
        requestData.visitId
      }, params: ${JSON.stringify(requestData)}`,
    );

    try {
      if (!requestData.visitId || !requestData.tenantId || !requestData.cvid || !requestData.deviceTime) {
        throw new ValidationError('Please provide required fields');
      }

      const [effectiveBranchId] = getEffectiveBranchIds(assumedBranchIds, branchIds);

      const [isCalcomSupported, shouldRedirectProgressNote] = await Promise.all([
        featureProvisioningService.getProvisionForBranchId(
          transactionId,
          BranchFeaturesProvisionEnum.ShiftsCalcomSystemSupport,
          effectiveBranchId,
        ),
        featureProvisioningService.getProvisionForBranchId(
          transactionId,
          BranchFeaturesProvisionEnum.ShiftsProgressNotePrivateWrite,
          effectiveBranchId,
        ),
      ]);

      const procuraIdentifiers = systemIdentifiers.filter(({ systemName }) => systemName === 'procura');
      const calcomIdentifiers = isCalcomSupported
        ? systemIdentifiers.filter(({ systemName }) => systemName === 'calcom')
        : [];

      const userSystemIdentifiers = [...procuraIdentifiers, ...calcomIdentifiers];

      const visitRequestParams = userSystemIdentifiers.map(({ empSystemId, tenantId, systemName, designation }) => ({
        employeeId: empSystemId,
        visitId: requestData.visitId,
        tenantId,
        systemType: systemName,
        cvid: requestData.cvid,
        expectedStartDate: new Date(),
        expectedEndDate: new Date(),
        designation,
      }));

      const visit = await visitService.getMatchingVisitForEmployeeIdsAndTenantIds(transactionId, visitRequestParams);

      let shouldIgnoreProgressNoteWriteback = false;
      let photoConsent: boolean;
      if (visit.systemType === 'procura') {
        const [client] = await clientService
          .getClientDetailByClientAndTenantIds(transactionId, [
            {
              clientId: visit.clientId,
              tenantId: visit.tenantId,
            },
          ])
          .catch(); // Silent fail

        // TODO Move this to utility later
        // Attendance type defines training visit, currently procura identifies based on client firstName
        if (
          client?.lastName?.toLowerCase().includes('in-office meeting') ||
          client?.firstName?.toLowerCase().includes('in-office meeting') ||
          client?.isAttendance
        ) {
          shouldIgnoreProgressNoteWriteback = true;
        }

        if (client?.photoConsent?.granted) {
          photoConsent = true;
        }
      }
      const [currentEmployeeId] = visit.scheduledEmployeeIds;

      const geo =
        requestData.geo?.latitude && requestData.geo?.longitude
          ? {
              latitude: `${requestData.geo.latitude}`,
              longitude: `${requestData.geo.longitude}`,
            }
          : undefined;

      const noteForWellness = requestData.wellnessNotes
        ? {
            subject: `Wellness Note for CVID ${visit.cvid} by ${displayName}`,
            content: requestData.wellnessNotes,
          }
        : undefined;

      // TODO: Move this to a mapper
      const visitLevelActivities = new Map<string, boolean>();
      visit.adlChecklist?.map((activity) => {
        visitLevelActivities.set(activity.activityId, activity.isVisitLevel);
      });

      const { cvid: completedCvid, isTimedOut } = await visitService.checkout(transactionId, {
        cvid: visit.cvid,
        visitId: visit.visitId,
        tenantId: visit.tenantId,
        clientId: visit.clientId,
        createdBy: displayName,
        employeeId: currentEmployeeId,
        systemType: visit.systemType,
        caregiverEmail: email,
        checkoutTime: requestData.deviceTime,
        clientPsId: visit.clientPsId,
        geo,
        noteForWellness,
        wellnessImageUrls: photoConsent ? requestData.wellnessImageUrls : undefined,
        wellnessNote: requestData.wellnessNotes ?? '',
        wellnessStatusQuestions: requestData.wellnessStatusQuestions ?? [],
        activities: requestData.activities?.map((activity) => ({
          activityId: activity.careplanId,
          status: activity.isCompleted,
          reason: activity.reason,
          isVisitLevel: visitLevelActivities.get(activity.careplanId),
        })),
        lateReason: requestData.lateReason,
      });

      let responseMessage = `Checked out to ${completedCvid} Successfully`;

      if (isTimedOut) {
        responseMessage = `Your shift ${completedCvid} is submitted for checkout, please check back later`;
      } else if (requestData.progressNote) {
        responseMessage = `You've successfully Checked out to ${completedCvid} and submitted progress notes.`;
      }

      const timeTaken = timeTrackEnd(startTime);

      logInfo(
        `[${transactionId}] [CONTROLLER] [visitCheckout] SUCCESSFUL (ASYNC) for employeePsId: ${obUserPsId}, visitId: ${visit.visitId}, timeTaken: ${timeTaken}`,
      );

      await cacheService.remove(transactionId, {
        serviceName: 'checkedInStatus',
        identifier: `${visit.visitId}_${visit.tenantId}`,
      });
      await cacheService.persist(transactionId, {
        serviceName: 'checkedOutStatus',
        identifier: `${visit.visitId}_${visit.tenantId}`,
        data: { employeeId: currentEmployeeId, visitId: visit.visitId, tenantId: visit.tenantId },
        expires: '7d',
      });
      await cacheService.persist(transactionId, {
        serviceName: 'checkedOutStatus',
        identifier: `cvid_${visit.cvid}_day_${new Date(
          visit.startDateTime,
        ).getDate()}_emp_${currentEmployeeId}_tenant_${visit.tenantId}`,
        data: {
          employeeId: currentEmployeeId,
          timestamp: new Date().toISOString(),
          visitId: visit.visitId,
          tenantId: visit.tenantId,
        },
        expires: '7d',
      });

      if (!shouldIgnoreProgressNoteWriteback && requestData.progressNote) {
        const matchingEmployeeSystem = visitRequestParams.find(
          ({ employeeId }) => employeeId === currentEmployeeId && visit.tenantId === visit.tenantId,
        );

        let modifiedSubject = `Progress Note for CVID ${visit.cvid} by ${displayName}`;

        if (requestData.progressNoteSubject) {
          modifiedSubject = `${requestData.progressNoteSubject.trim()} -${
            matchingEmployeeSystem.designation ? `[${matchingEmployeeSystem.designation}]` : ''
          } [${displayName}]`;
        }

        await visitService
          .createVisitNote(transactionId, {
            visitId: visit.visitId,
            clientId: visit.clientId,
            employeeId: currentEmployeeId,
            createdBy: displayName,
            tenantId: visit.tenantId,
            noteForBranch: {
              subject: modifiedSubject.slice(0, 80), // TODO: procura requirement but cleanup later
              content: `${requestData.progressNote}`,
              noteType: shouldRedirectProgressNote
                ? NoteTypeEnum.PrivateProgressNotes
                : NoteTypeEnum.ClientConditionUpdate, // TODO: Private may use different NoteType
            },
          })
          .catch(() => null);
      }

      response.status(HttpStatusCode.OK).json({
        title: responseMessage,
        message: responseMessage,
        payload: requestData,
        actionStatus: isTimedOut ? 'pending' : 'success',
      });

      responded = true;

      await tempDataService
        .deleteTempData(transactionId, prefixOngoingVisit(obUserPsId), TempDataValueEnum.Visit)
        .catch(); // Silent fail

      if (requestData.wellnessNotes) {
        const [firstMatchingBranchId] = branchIds;

        const wellnessNotes: OBWellnessNoteUpsertOperationType = {
          cvid: requestData.cvid,
          employeePsId: obUserPsId,
          employeeName: displayName,
          visitId: visit.visitId,
          clientId: visit.clientId,
          tenantId: visit.tenantId,
          branchId: firstMatchingBranchId,
          note: requestData.wellnessNotes,
          checkoutAt: new Date(requestData.deviceTime),
        };

        await wellnessNoteService.createWellnessNote(transactionId, wellnessNotes);
      }
    } catch (checkoutErr) {
      if (responded) {
        logError(
          `[${transactionId}] [CONTROLLER] [visitCheckout] Checkout success and responded but other error for employeePsId: ${obUserPsId}, visitId: ${requestData.visitId}, tenantId: ${requestData.tenantId}, reason: ${checkoutErr.message}`,
        );

        return;
      }

      logError(
        `[${transactionId}] [CONTROLLER] [visitCheckout] FAILED for employeePsId: ${obUserPsId}, visitId: ${requestData.visitId}, tenantId: ${requestData.tenantId}, reason: ${checkoutErr.message}`,
      );

      // Offline mode should continue execution
      if (request.query.mode === 'offline') {
        logError(
          `[${transactionId}] [CONTROLLER] [visitCheckout] Caching in temp for employeePsId: ${obUserPsId}, visitId: ${requestData.visitId}, tenantId: ${requestData.tenantId}`,
        );

        await visitService.storeFailedCheckInOutInTemp(
          transactionId,
          {
            cvid: requestData.cvid,
            mode: 'checkout',
            psId: obUserPsId,
            tenantId: requestData.tenantId,
          },
          requestData,
        );

        response.status(HttpStatusCode.OK).json({
          message: 'We encountered some unexpected behavior with the checkout, we will look into this issue!',
          payload: requestData,
          actionStatus: 'pending',
        });

        return;
      }

      next(checkoutErr);
    }
  };

  private visitReset = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;
    const { obUserPsId, displayName, systemIdentifiers = [], branchIds, assumedBranchIds } = request.obUserIdentity;
    const {
      visitId,
      tenantId: tenantIdFromRequest,
      cvid,
      message: deprecatedCancelReason,
      cancelReason,
    }: { visitId: string; tenantId: string; cvid: string; cancelReason?: string; message?: string } = request.body;

    logInfo(
      `[${transactionId}] [CONTROLLER] [visitReset] Visit reset initiated for employeePsId: ${obUserPsId}, cvid: ${cvid}, tenantId: ${tenantIdFromRequest}`,
    );

    try {
      const [effectiveBranchId] = getEffectiveBranchIds(assumedBranchIds, branchIds);
      const matchingSystemIdentifier = systemIdentifiers.find(({ tenantId }) => tenantId === tenantIdFromRequest);
      const shouldRedirectProgressNote = await featureProvisioningService.getProvisionForBranchId(
        transactionId,
        BranchFeaturesProvisionEnum.ShiftsProgressNotePrivateWrite,
        effectiveBranchId,
      );

      if (!matchingSystemIdentifier) {
        throw new ValidationError('Please provide required fields');
      }

      const matchingVisit = await visitService.getMatchingVisitForEmployeeIdsAndTenantIds(transactionId, [
        {
          cvid,
          visitId,
          tenantId: tenantIdFromRequest,
          employeeId: matchingSystemIdentifier.empSystemId,
          systemType: matchingSystemIdentifier.systemName,
        },
      ]);

      if (!matchingVisit) {
        throw new Error('Unable to cancel the visit');
      }

      const { cvid: completedCvid } = await visitService.resetCheckin(transactionId, {
        cvid,
        visitId,
        tenantId: tenantIdFromRequest,
        employeeId: matchingSystemIdentifier.empSystemId,
      });

      logInfo(`[${transactionId}] [CONTROLLER] [visitReset] Visit reset to ${completedCvid} done successfully`);

      await cacheService.remove(transactionId, {
        serviceName: 'checkedInStatus',
        identifier: `${matchingVisit.visitId}_${matchingVisit.tenantId}`,
      });

      if (deprecatedCancelReason || cancelReason) {
        await visitService.createVisitNote(transactionId, {
          visitId,
          clientId: matchingVisit.clientId,
          employeeId: matchingSystemIdentifier.empSystemId,
          createdBy: displayName,
          tenantId: tenantIdFromRequest,
          noteForBranch: {
            content: deprecatedCancelReason || cancelReason,
            subject: `Reset ${cvid} by ${displayName} reason`,
            noteType: shouldRedirectProgressNote
              ? NoteTypeEnum.PrivateProgressNotes
              : NoteTypeEnum.ClientConditionUpdate, // TODO: Private may use different NoteType
          },
        });
        logInfo(`[${transactionId}] [CONTROLLER] [visitReset] Reset reason created for visitId: ${visitId}`);
      }

      response.status(HttpStatusCode.OK).json({
        cvid,
        visitId,
        tenantId: tenantIdFromRequest,
        message: `Visit ${cvid} reset successfully`,
      });
    } catch (cancelErr) {
      logError(`[${transactionId}] [CONTROLLER] [visitReset] Failed to cancel visit, reason: ${cancelErr.message}`);

      next(cancelErr);
    }
  };

  private createVisitNote = async (
    request: express.Request,
    response: express.Response,
    next: NextFunction,
  ): Promise<void> => {
    const transactionId = request.txId;
    const { visitId } = request.params;

    const { displayName, systemIdentifiers, assumedBranchIds, branchIds } = request.obUserIdentity;

    const { cvid, clientId, tenantId, noteForBranch }: HttpPostCreateNoteType = request.body;

    logInfo(`[${transactionId}] [CONTROLLER] [createVisitNote] Creating note for visitId: ${visitId}, cvid: ${cvid}`);

    const [effectiveBranchId] = getEffectiveBranchIds(assumedBranchIds, branchIds);

    const shouldRedirectProgressNote = await featureProvisioningService.getProvisionForBranchId(
      transactionId,
      BranchFeaturesProvisionEnum.ShiftsProgressNotePrivateWrite,
      effectiveBranchId,
    );

    const matchingEmployeeSystem = systemIdentifiers.find(
      (employeeSystem) => employeeSystem.systemName === 'procura' && employeeSystem.tenantId === tenantId,
    );

    if (!matchingEmployeeSystem) {
      logError(
        `[${transactionId}] [CONTROLLER] [createVisitNote] No matching employee system found for tenantId: ${tenantId}`,
      );
      throw new Error(`No matching employee system found for the provided tenantId: ${tenantId}.`);
    }

    if (!matchingEmployeeSystem?.empSystemId) {
      throw new Error('Missing required field: employeeId');
    }

    const employeeId = matchingEmployeeSystem.empSystemId;

    const [client] = await clientService
      .getClientDetailByClientAndTenantIds(transactionId, [
        {
          clientId,
          tenantId,
        },
      ])
      .catch(() => null); // Silent fail

    // isAttendance defines fake client
    if (client?.isAttendance) {
      logWarn(`[${transactionId}] [CONTROLLER] client is of attendance type`);

      response.status(HttpStatusCode.METHOD_NOT_ALLOWED).json({ message: 'Client is of Attendance Type' });

      return;
    }

    logInfo(`[${transactionId}] [CONTROLLER] createVisitNote: Creating note for employeeId: [${employeeId}]`);

    if (!clientId || !employeeId || !displayName || !tenantId || !noteForBranch || !displayName) {
      throw new ValidationError('Missing required fields for creating a note.');
    }

    if (!noteForBranch.content) {
      throw new ValidationError('Note details (subject, content) are required.');
    }

    let modifiedSubject = `Progress Note by ${displayName}`;

    if (noteForBranch.subject) {
      modifiedSubject = `${noteForBranch.subject.trim()} - ${
        matchingEmployeeSystem.designation ? `[${matchingEmployeeSystem.designation}]` : ''
      } [${displayName}]`;
    }

    try {
      await visitService.createVisitNote(transactionId, {
        visitId,
        clientId,
        employeeId,
        createdBy: displayName,
        tenantId,
        noteForBranch: {
          content: noteForBranch.content,
          subject: modifiedSubject.slice(0, 80), // TODO: procura requirement but cleanup later
          noteType: shouldRedirectProgressNote ? NoteTypeEnum.PrivateProgressNotes : NoteTypeEnum.ClientConditionUpdate, // TODO: Private may use different NoteType
        },
      });
      logInfo(`[${transactionId}] [CONTROLLER] [createVisitNote] Note created for visitId: ${visitId}`);

      response.status(HttpStatusCode.OK).json({
        title: "You've submitted progress notes.",
        message: 'Submitted progress notes will be shown with a delay.',
      });
    } catch (err) {
      logError(`[${transactionId}] [CONTROLLER] [createVisitNote] Failed to create note: ${err.message}`);
      next(err);
    }
  };

  /**
   * @deprecated FOR QA PURPOSE ONLY
   * @description For QA testing, user/visit checks are ignored and rely on the request body
   */
  private qaVisitCheckin = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    const requestData: HttpPostCheckinType & {
      psId: string;
      clientId: string;
      employeeId: string;
      displayName: string;
      systemType: string;
      caregiverEmail: string;
    } = request.body;

    try {
      if (!requestData.visitId || !requestData.tenantId || !requestData.cvid || !requestData.deviceTime) {
        throw new ValidationError('Please provide required fields');
      }

      const geo =
        requestData.geo?.latitude && requestData.geo?.longitude
          ? {
              latitude: `${requestData.geo.latitude}`,
              longitude: `${requestData.geo.longitude}`,
            }
          : undefined;

      const { cvid: completedCvid, isTimedOut } = await visitService.checkin(transactionId, {
        cvid: requestData.cvid,
        visitId: requestData.visitId,
        tenantId: requestData.tenantId,
        clientId: requestData.clientId,
        createdBy: requestData.displayName,
        employeeId: requestData.employeeId,
        systemType: requestData.systemType,
        caregiverEmail: requestData.caregiverEmail,
        checkinTime: requestData.deviceTime,
        lateReason: requestData.lateReason,
        geo,
      });

      let responseMessage = `Checked in to ${completedCvid} Successfully`;

      if (isTimedOut) {
        responseMessage = `Your shift ${completedCvid} is submitted for checkin, please check back later`;
      } else if (requestData.progressNote) {
        responseMessage = `You've successfully checked in to ${completedCvid} and submitted progress notes.`;
      }

      response.status(HttpStatusCode.OK).json({
        title: responseMessage,
        message: responseMessage,
        payload: requestData,
        actionStatus: isTimedOut ? 'pending' : 'success',
      });

      const [client] = await clientService
        .getClientDetailByClientAndTenantIds(transactionId, [
          {
            clientId: requestData.clientId,
            tenantId: requestData.tenantId,
          },
        ])
        .catch(() => null); // Silent fail

      if (requestData.progressNote && !client?.isAttendance) {
        let modifiedSubject = `Progress Note for CVID ${requestData.cvid} by ${requestData.displayName}`;

        if (requestData.progressNoteSubject) {
          modifiedSubject = `${requestData.progressNoteSubject.trim()} - [${requestData.cvid}] [${
            requestData.displayName
          }]`;
        }

        await visitService
          .createVisitNote(transactionId, {
            visitId: requestData.visitId,
            clientId: requestData.clientId,
            employeeId: requestData.employeeId,
            createdBy: requestData.displayName,
            tenantId: requestData.tenantId,
            noteForBranch: {
              content: requestData.progressNote,
              subject: modifiedSubject.slice(0, 80),
              noteType: NoteTypeEnum.ClientConditionUpdate,
            },
          })
          .catch(() => null);
      }

      await cacheService.persist(transactionId, {
        serviceName: 'checkedInStatus',
        identifier: `${requestData.visitId}_${requestData.tenantId}`,
        data: { employeeId: requestData.employeeId, visitId: requestData.visitId, tenantId: requestData.tenantId },
        expires: '7d',
      });

      // TODO check to see if this can be stored in user collection
      await tempDataService.addTempData(
        transactionId,
        {
          primaryIdentifier: prefixOngoingVisit(requestData.psId),
          valueType: TempDataValueEnum.Visit,
          payload: {
            visitId: requestData.visitId,
            tenantId: requestData.tenantId,
            cvid: requestData.cvid,
          },
          valueStatus: ActiveStateEnum.Pending,
        },
        {
          shouldOverride: true,
        },
      );
    } catch (checkinErr) {
      logError(
        `[${transactionId}] [CONTROLLER] [visitCheckin] FAILED for employeePsId: ${requestData.psId}, visitId: ${requestData.visitId}, tenantId: ${requestData.tenantId}, reason: ${checkinErr.message}`,
      );

      next(checkinErr);
    }
  };

  /**
   * @deprecated FOR QA PURPOSE ONLY
   */
  private qaVisitCheckout = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    const requestData: HttpPostCheckoutType & {
      psId: string;
      clientId: string;
      employeeId: string;
      displayName: string;
      systemType: string;
      caregiverEmail: string;
    } = request.body;

    try {
      if (!requestData.visitId || !requestData.tenantId || !requestData.cvid || !requestData.deviceTime) {
        throw new ValidationError('Please provide required fields');
      }

      const geo =
        requestData.geo?.latitude && requestData.geo?.longitude
          ? {
              latitude: `${requestData.geo.latitude}`,
              longitude: `${requestData.geo.longitude}`,
            }
          : undefined;

      const noteForWellness = requestData.wellnessNotes
        ? {
            subject: `Wellness Note for CVID ${requestData.cvid} by ${requestData.displayName}`,
            content: requestData.wellnessNotes,
          }
        : undefined;

      const { cvid: completedCvid, isTimedOut } = await visitService.checkout(transactionId, {
        cvid: requestData.cvid,
        visitId: requestData.visitId,
        tenantId: requestData.tenantId,
        clientId: requestData.clientId,
        createdBy: requestData.displayName,
        employeeId: requestData.employeeId,
        systemType: requestData.systemType,
        caregiverEmail: requestData.caregiverEmail,
        checkoutTime: requestData.deviceTime,
        geo,
        noteForWellness,
        wellnessNote: requestData.wellnessNotes ?? '',
        wellnessStatusQuestions: requestData.wellnessStatusQuestions ?? [],
        activities: requestData.activities?.map((activity) => ({
          activityId: activity.careplanId,
          status: activity.isCompleted,
          reason: activity.reason,
        })),
        lateReason: requestData.lateReason,
      });

      let responseMessage = `Checked out to ${completedCvid} Successfully`;

      if (isTimedOut) {
        responseMessage = `Your shift ${completedCvid} is submitted for checkout, please check back later`;
      } else if (requestData.progressNote) {
        responseMessage = `You've successfully Checked out to ${completedCvid} and submitted progress notes.`;
      }

      await cacheService.remove(transactionId, {
        serviceName: 'checkedInStatus',
        identifier: `${requestData.visitId}_${requestData.tenantId}`,
      });
      await cacheService.persist(transactionId, {
        serviceName: 'checkedOutStatus',
        identifier: `${requestData.visitId}_${requestData.tenantId}`,
        data: { employeeId: requestData.employeeId, visitId: requestData.visitId, tenantId: requestData.tenantId },
        expires: '7d',
      });

      if (!requestData.progressNote) {
        let modifiedSubject = `Progress Note for CVID ${requestData.cvid} by ${requestData.displayName}`;

        if (requestData.progressNoteSubject) {
          modifiedSubject = `${requestData.progressNoteSubject.trim()} - [${requestData.cvid}] [${
            requestData.displayName
          }]`;
        }

        await visitService
          .createVisitNote(transactionId, {
            visitId: requestData.visitId,
            clientId: requestData.clientId,
            employeeId: requestData.employeeId,
            createdBy: requestData.displayName,
            tenantId: requestData.tenantId,
            noteForBranch: {
              subject: modifiedSubject.slice(0, 80),
              content: `${requestData.progressNote}`,
              noteType: NoteTypeEnum.ClientConditionUpdate,
            },
          })
          .catch(() => null);
      }

      response.status(HttpStatusCode.OK).json({
        title: responseMessage,
        message: responseMessage,
        payload: requestData,
        actionStatus: isTimedOut ? 'pending' : 'success',
      });

      await tempDataService
        .deleteTempData(transactionId, prefixOngoingVisit(requestData.psId), TempDataValueEnum.Visit)
        .catch(); // Silent fail
    } catch (checkoutErr) {
      next(checkoutErr);
    }
  };

  /**
   * @deprecated FOR QA PURPOSE ONLY
   */
  private qaVisitReset = async (request: express.Request, response: express.Response, next: NextFunction) => {
    const transactionId = request.txId;

    const {
      visitId,
      tenantId: tenantIdFromRequest,
      cvid,
      message: deprecatedCancelReason,
      cancelReason,

      // Extra
      employeeId,
      systemType,
      displayName,
    }: { visitId: string; tenantId: string; cvid: string; cancelReason?: string; message?: string } & {
      psId: string;
      clientId: string;
      employeeId: string;
      displayName: string;
      systemType: string;
      caregiverEmail: string;
    } = request.body;

    try {
      const matchingVisit = await visitService.getMatchingVisitForEmployeeIdsAndTenantIds(transactionId, [
        {
          cvid,
          visitId,
          tenantId: tenantIdFromRequest,
          employeeId,
          systemType,
        },
      ]);

      if (!matchingVisit) {
        throw new Error('Unable to cancel the visit');
      }

      const { cvid: completedCvid } = await visitService.resetCheckin(transactionId, {
        cvid,
        visitId,
        tenantId: tenantIdFromRequest,
        employeeId,
      });

      logInfo(`[${transactionId}] [CONTROLLER] [visitReset] Visit reset to ${completedCvid} done successfully`);

      await cacheService.remove(transactionId, {
        serviceName: 'checkedInStatus',
        identifier: `${matchingVisit.visitId}_${matchingVisit.tenantId}`,
      });

      if (deprecatedCancelReason || cancelReason) {
        await visitService.createVisitNote(transactionId, {
          visitId,
          clientId: matchingVisit.clientId,
          employeeId,
          createdBy: displayName,
          tenantId: tenantIdFromRequest,
          noteForBranch: {
            content: deprecatedCancelReason || cancelReason,
            subject: `Reset ${cvid} by ${displayName} reason`,
            noteType: NoteTypeEnum.ClientConditionUpdate,
          },
        });
        logInfo(`[${transactionId}] [CONTROLLER] [visitReset] Reset reason created for visitId: ${visitId}`);
      }

      response.status(HttpStatusCode.OK).json({
        cvid,
        visitId,
        tenantId: tenantIdFromRequest,
        message: `Visit ${cvid} reset successfully`,
      });
    } catch (cancelErr) {
      logError(`[${transactionId}] [CONTROLLER] [visitReset] Failed to cancel visit, reason: ${cancelErr.message}`);

      next(cancelErr);
    }
  };

  /**
   * @deprecated FOR QA PURPOSE ONLY
   */
  private qaCreateVisitNote = async (
    request: express.Request,
    response: express.Response,
    next: NextFunction,
  ): Promise<void> => {
    const transactionId = request.txId;

    const {
      cvid,
      visitId,
      clientId,
      tenantId,
      employeeId,
      displayName,
      noteForBranch,
    }: HttpPostCreateNoteType & {
      psId: string;
      clientId: string;
      employeeId: string;
      displayName: string;
      systemType: string;
      caregiverEmail: string;
    } = request.body;

    if (!clientId || !employeeId || !displayName || !tenantId || !noteForBranch || !displayName) {
      throw new ValidationError('Missing required fields for creating a note.');
    }

    if (!noteForBranch.content) {
      throw new ValidationError('Note details (subject, content) are required.');
    }

    let modifiedSubject = `Progress Note by ${displayName}`;

    if (noteForBranch.subject) {
      modifiedSubject = `${noteForBranch.subject.trim()} - [${cvid}] [${displayName}]`;
    }

    try {
      await visitService.createVisitNote(transactionId, {
        visitId,
        clientId,
        employeeId,
        createdBy: displayName,
        tenantId,
        noteForBranch: {
          content: noteForBranch.content,
          subject: modifiedSubject.slice(0, 80),
          noteType: NoteTypeEnum.ClientConditionUpdate,
        },
      });
      logInfo(`[${transactionId}] [CONTROLLER] [createVisitNote] Note created for visitId: ${visitId}`);

      response.status(HttpStatusCode.OK).json({
        title: "You've submitted progress notes.",
        message: 'Submitted progress notes will be shown with a delay.',
      });
    } catch (err) {
      logError(`[${transactionId}] [CONTROLLER] [createVisitNote] Failed to create note: ${err.message}`);
      next(err);
    }
  };
}
