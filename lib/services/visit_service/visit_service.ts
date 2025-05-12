import axios, { AxiosResponse } from 'axios';
import config from 'config';
import ms from 'ms';
import { cacheService, tempDataService } from '..';
import { ActiveStateEnum, NoteTypeEnum, TempDataValueEnum } from '../../enums';
import { logError, logInfo, logWarn } from '../../log/util';
import {
  ProcuraVisitFromSystemType,
  HttpPostVisitCheckInCheckOut,
  VisitFromSystemType,
  CheckinToSystemType,
  CheckoutToSystemType,
  JSONLikeType,
  CreateNoteType,
  ResetCheckinPostType,
} from '../../types';
import { subDays, startOfDay, formatDate, prefixFailedVisitAttempt } from '../../utils';
import { getSecret } from '../../vendors';

const eventServiceConfig: { endpoint: string; apiKeyHeader: string; secretKeyName: string } =
  config.get('Services.eventService');

const getSystemVisitsByDates = async (
  transactionId: string,
  {
    employeeId,
    tenantId,
    startDate,
    endDate,
    systemType,
  }: {
    employeeId: string;
    tenantId: string;
    startDate: Date;
    endDate: Date;
    systemType: string;
  },
): Promise<VisitFromSystemType[]> => {
  try {
    logInfo(`[${transactionId}] [SERVICE] [getSystemVisitsByDates] initiated`);

    const apiKey = await getSecret(eventServiceConfig.secretKeyName);

    const startDateFormatted = formatDate(startDate, 'yyyy-MM-dd');
    const endDateFormatted = formatDate(endDate, 'yyyy-MM-dd');

    logInfo(
      `[${transactionId}] [SERVICE] [getSystemVisitsByDates] request parameters: ${JSON.stringify({
        employeeId,
        tenantId,
        systemType,
        startDate: startDateFormatted,
        endDate: endDateFormatted,
      })}`,
    );

    const response = await axios.get(`${eventServiceConfig.endpoint}/api/v1/employees/${employeeId}/visits`, {
      headers: {
        'Content-Type': 'application/json',
        [`${eventServiceConfig.apiKeyHeader}`]: `${apiKey}`,
      },
      params: {
        systemType,
        tenantId,
        startDate: startDateFormatted,
        endDate: endDateFormatted,
      },
    });

    if (!Array.isArray(response.data) || response.data.length === 0) {
      logError(`[${transactionId}] [SERVICE] [getSystemVisitsByDates] no response received`);

      throw new Error('No visits received');
    }

    logInfo(
      `[${transactionId}] [SERVICE] [getSystemVisitsByDates] SUCCESSFUL, results: ${JSON.stringify(response.data)}`,
    );

    const cachePromises: Promise<void>[] = [];

    response.data.forEach((visit) => {
      if (!visit.visitId || !visit.tenantId) {
        return;
      }

      cachePromises.push(
        cacheService.persist(transactionId, {
          serviceName: 'visitService',
          identifier: `${visit.visitId}_${visit.tenantId}`,
          data: visit,
          expires: '5m',
        }),
      );
    });

    await Promise.all(cachePromises);

    return response.data as VisitFromSystemType[];
  } catch (fetchErr) {
    logError(`[${transactionId}] [SERVICE] [getSystemVisitsByDates] FAILED, reason: ${fetchErr.message}`);

    return [];
  }
};

const getVisitByVisitIdAndTenantId = async (
  transactionId: string,
  {
    employeeId,
    visitId,
    tenantId,
    systemType,
  }: {
    employeeId: string;
    visitId: string;
    tenantId: string;
    systemType: string;
  },
): Promise<VisitFromSystemType> => {
  logInfo(`[${transactionId}] [SERVICE] [getVisitByVisitIdAndTenantId] initiated`);

  const apiKey = await getSecret(eventServiceConfig.secretKeyName);

  try {
    const cachedVisit = (await cacheService.retrieve(
      transactionId,
      {
        serviceName: 'visitService',
        identifier: `${visitId}_${tenantId}`,
      },
      true,
    )) as VisitFromSystemType | null;

    if (cachedVisit) {
      return cachedVisit;
    }

    logInfo(
      `[${transactionId}] [SERVICE] [getVisitByVisitIdAndTenantId] request parameters: ${JSON.stringify({
        visitId,
        tenantId,
        systemType,
      })}`,
    );

    const progressNotesSince = formatDate(startOfDay(subDays(new Date(), 14)), 'yyyy-MM-dd');
    // TODO: Increase the days as ToA's needs to be displayed from longer time
    const toASince = formatDate(startOfDay(subDays(new Date(), 100)), 'yyyy-MM-dd');

    const response: AxiosResponse<VisitFromSystemType | null> = await axios.get(
      `${eventServiceConfig.endpoint}/api/v1/employees/${employeeId}/visits/${visitId}`,
      {
        params: {
          tenantId,
          systemType,
          notesStartDate: progressNotesSince,
          toaStartDate: toASince,
        },
        headers: {
          'Content-Type': 'application/json',
          [`${eventServiceConfig.apiKeyHeader}`]: `${apiKey}`,
        },
      },
    );

    if (!response.data) {
      logInfo(`[${transactionId}] [SERVICE] [getVisitByVisitIdAndTenantId] No Visit Found, visitId: ${visitId}`);
    }

    logInfo(
      `[${transactionId}] [SERVICE] [getVisitByVisitIdAndTenantId] Visit Found for employeeId: ${employeeId} and tenantId: ${tenantId}, visit: ${JSON.stringify(
        response.data,
      )}`,
    );

    return response.data;
  } catch (error) {
    logError(
      `[${transactionId}] [SERVICE] [getVisitByVisitIdAndTenantId] Failed for employeeId: ${employeeId} and tenantId: ${tenantId}, reason : ${error.message}`,
    );

    throw error;
  }
};

/**
 * @deprecated Try to make use of local copy of written data instead of this
 * @description The visit details collected from the previous writeback data
 * Queries the procura-visits collection in the microservice
 */
const getWrittenVisitByVisitIdAndTenantId = async (
  transactionId: string,
  bearerToken: string,
  {
    visitId,
    tenantId,
    systemType,
  }: {
    visitId: string;
    tenantId: string;
    systemType: string;
  },
): Promise<ProcuraVisitFromSystemType> => {
  logInfo(
    `[${transactionId}] [SERVICE] [getWrittenVisitByVisitIdAndTenantId] initiated for visitId: ${visitId}, tenantId: ${tenantId}`,
  );

  const response = await axios.get<ProcuraVisitFromSystemType[]>(
    `${eventServiceConfig.endpoint}/api/v1/employee/procura-visits/previous`,
    {
      headers: {
        Authorization: `${bearerToken}`,
      },
      params: {
        visitIds: visitId,
        tenantId,
        systemType,
      },
    },
  );

  if (!Array.isArray(response.data) || response.data.length === 0) {
    logWarn(
      `[${transactionId}] [SERVICE] [getWrittenVisitByVisitIdAndTenantId] No previous written entries for visitId: ${visitId}, tenantId: ${tenantId}`,
    );

    throw new Error('No prior entries for the written data');
  }

  logInfo(
    `[${transactionId}] [SERVICE] [getWrittenVisitByVisitIdAndTenantId] ${response.data.length} previous written entries for visitId: ${visitId}, tenantId: ${tenantId}`,
  );

  const [latestWritebackEntry] = response.data
    .filter(({ tenantDbName }) => tenantDbName === tenantId)
    .sort((entryA, entryB) => new Date(entryB.createdDate).getTime() - new Date(entryA.createdDate).getTime());

  if (!latestWritebackEntry) {
    logWarn(
      `[${transactionId}] [SERVICE] [getWrittenVisitByVisitIdAndTenantId] unmatched written entries for visitId: ${visitId}, tenantId: ${tenantId}`,
    );

    throw new Error('Unmatched visit found');
  }

  return latestWritebackEntry;
};

/**
 * @deprecated use procuraCheckin or procuraCheckout instead
 */
const procuraCheckInCheckOut = async (
  transactionId: string,
  bearerToken: string,
  checkInCheckOutData: HttpPostVisitCheckInCheckOut,
): Promise<Partial<ProcuraVisitFromSystemType & { isTimedOut?: boolean }>> => {
  const CALL_MAX_TIMEOUT_WAIT = ms('20s');

  logInfo(`[${transactionId}] [SERVICE] [procuraCheckInCheckOut] initiated`);

  try {
    logInfo(
      `[${transactionId}] [SERVICE] [procuraCheckInCheckOut] request parameters: ${JSON.stringify(
        checkInCheckOutData,
      )}`,
    );

    const dbMapper = {
      [checkInCheckOutData.dbTenantName]: checkInCheckOutData.dbTenantName, // Default in case there is no overriding name
      Procura_Leapfrog: 'Procura_Leapfrog',
      Procura_BHHEast: 'Procura_BHHEast',
      Procura_BHHWest: 'Procura_BHHWest',
      Procura_BHHFrench: 'Procura_BHHFrench',
      Procura_BayshoreHH2: 'Procura_BayshoreHH2',
      Procura_Simcoe: 'Procura_Simcoe',
      BayshoreICS_Live: 'Procura_ICS',
    };

    checkInCheckOutData.dbTenantName = dbMapper[checkInCheckOutData.dbTenantName];

    const response: AxiosResponse<ProcuraVisitFromSystemType> = await axios.post(
      `${eventServiceConfig.endpoint}/api/v1/employee/procura-visits/checkinCheckout`,
      checkInCheckOutData,
      {
        headers: {
          Authorization: `${bearerToken}`,
        },
        timeout: CALL_MAX_TIMEOUT_WAIT,
      },
    );

    logInfo(
      `[${transactionId}] [SERVICE] [procuraCheckInCheckOut] SUCCESSFUL, results: ${JSON.stringify(response.data)}`,
    );

    return response.data;
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      logError(
        `[Procura checkinCheckout] Call Failed and Wait timeout exceeded limit ${CALL_MAX_TIMEOUT_WAIT}ms, reason: ${error.message}`,
      );

      return {
        isTimedOut: true,
        visitStatus: checkInCheckOutData.status,
        callVisitId: checkInCheckOutData.cvid,
        visitId: checkInCheckOutData.visitId,
        tenantDbName: checkInCheckOutData.dbTenantName,
        clientId: checkInCheckOutData.clientId,
      };
    }

    logError(`[Procura checkinCheckout] Call Failed, reason: ${error.message}`);

    throw error;
  } finally {
    await cacheService.batchRemove(transactionId, [
      {
        serviceName: 'visitService',
        identifier: `${checkInCheckOutData.visitId}_${checkInCheckOutData.dbTenantName}`,
      },
      {
        serviceName: 'clientService',
        identifier: `${checkInCheckOutData.clientId}_${checkInCheckOutData.dbTenantName}`,
      },
      {
        serviceName: 'clientService',
        identifier: `${checkInCheckOutData.peopleSoftClientId}`,
      },
    ]);
  }
};

const getMatchingVisitForEmployeeIdsAndTenantIds = async (
  transactionId: string,
  empVisitList: {
    cvid?: string;
    visitId: string;
    tenantId: string;
    employeeId: string;
    systemType: string;
    expectedStartDate?: Date;
    expectedEndDate?: Date;
  }[],
): Promise<VisitFromSystemType> => {
  logInfo(
    `[${transactionId}] [SERVICE] [getMatchingVisitForEmployeeIdsAndTenantIds] initiated, params: ${JSON.stringify({
      empVisitList,
    })}`,
  );

  const aggregatedVisitQueryResults = await Promise.allSettled(
    empVisitList.map(({ visitId, tenantId, employeeId, systemType }) =>
      getVisitByVisitIdAndTenantId(transactionId, {
        visitId,
        tenantId,
        employeeId,
        systemType,
      }),
    ),
  );

  const errors: string[] = [];
  const uniqueVisits: VisitFromSystemType[] = [];
  const duplicationTrackSet = new Set<string>();

  aggregatedVisitQueryResults.forEach((visitQueryResult) => {
    if (visitQueryResult.status === 'rejected') {
      errors.push(visitQueryResult.reason);

      return;
    }

    if (visitQueryResult.status === 'fulfilled' && visitQueryResult.value && !visitQueryResult.value.plannerId) {
      const visit = visitQueryResult.value;

      if (!duplicationTrackSet.has(`${visit.visitId}_${visit.tenantId}`)) {
        duplicationTrackSet.add(`${visit.visitId}_${visit.tenantId}`);

        uniqueVisits.push(visit);
      }
    }
  });

  try {
    // The employeeId, visitId, tenantId should always be unique
    // The length should match 1 if valid data exists
    if (uniqueVisits.length !== 1) {
      logError(
        `[${transactionId}] [SERVICE] errors while getting visit details: ${JSON.stringify(
          aggregatedVisitQueryResults,
        )}`,
      );
    }

    if (uniqueVisits.length === 0) {
      throw new Error('Unable to match the right visit for provided employee');
    }

    let [matchingVisit] = uniqueVisits;

    if (uniqueVisits.length > 1) {
      const empIdMap = new Set<string>();

      empVisitList.forEach(({ employeeId }) => {
        empIdMap.add(employeeId);
      });

      uniqueVisits.forEach((visit) => {
        const [visitEmployeeId] = visit.scheduledEmployeeIds;

        if (empIdMap.has(visitEmployeeId)) {
          matchingVisit = visit;
        }
      });
    }

    if (!matchingVisit) {
      throw new Error('Unable to match the right visit for provided employee');
    }

    return matchingVisit;
  } catch (visitErr) {
    // Fallback to the cvid approach
    logWarn(`[${transactionId}] [SERVICE] [getMatchingVisitForEmployeeIdsAndTenantIds] Fallback initiated using cvid`);

    const aggregatedVisitQueryResults = await Promise.allSettled(
      empVisitList.map(({ cvid, tenantId, employeeId, systemType, expectedStartDate, expectedEndDate }) =>
        getVisitByCvidAndTenantId(transactionId, {
          cvid,
          tenantId,
          employeeId,
          systemType,
          visitStartDate: expectedStartDate,
          visitEndDate: expectedEndDate,
        }),
      ),
    );

    let matchingCvidVisit: VisitFromSystemType;

    aggregatedVisitQueryResults.forEach((aggregatedVisitQueryResult) => {
      if (aggregatedVisitQueryResult.status === 'fulfilled') {
        matchingCvidVisit = aggregatedVisitQueryResult.value;
      }
    });

    if (!matchingCvidVisit) {
      throw new Error('Unable to match the right visit for provided employee');
    }

    return matchingCvidVisit;
  }
};

const resetCheckin = async (
  transactionId: string,
  resetCheckinParams: ResetCheckinPostType,
): Promise<{ cvid: string }> => {
  logInfo(`[${transactionId}] [SERVICE] [resetCheckin] initiated`);

  const apiKey = await getSecret(eventServiceConfig.secretKeyName);

  try {
    if (
      !resetCheckinParams.employeeId ||
      !resetCheckinParams.visitId ||
      !resetCheckinParams.tenantId ||
      !resetCheckinParams.cvid
    ) {
      throw new Error('Missing required reset checkin params');
    }

    const response = await axios.post<ProcuraCheckinCheckoutResponseType>(
      `${eventServiceConfig.endpoint}/api/v1/employees/${resetCheckinParams.employeeId}/visits/${resetCheckinParams.visitId}/reset-checkin`,
      {
        ...resetCheckinParams,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          [`${eventServiceConfig.apiKeyHeader}`]: `${apiKey}`,
          'X-Transaction-Id': transactionId,
        },
      },
    );

    if (!response.data.success) {
      throw new Error(`Reset checkin for ${resetCheckinParams.cvid} failed`);
    }

    return { cvid: resetCheckinParams.cvid };
  } catch (resetCheckinErr) {
    logError(
      `[${transactionId}] [SERVICE] [resetCheckin] reset checkin FAILED for visitId: ${resetCheckinParams.visitId}, reason: ${resetCheckinErr.message}`,
    );
    logError(
      `[${transactionId}] [SERVICE] [resetCheckin] reset checkin FAILED for employeeId: ${resetCheckinParams.employeeId}, reason: ${resetCheckinErr.message}`,
    );
    logError(
      `[${transactionId}] [SERVICE] [resetCheckin] reset checkin FAILED details: ${JSON.stringify(resetCheckinParams)}`,
    );

    throw resetCheckinErr;
  }
};

type ProcuraCheckinCheckoutResponseType = {
  success: boolean;
};
const checkin = async (
  transactionId: string,
  checkinParams: CheckinToSystemType,
  shouldFallbackSync?: boolean,
): Promise<{ cvid: string; isTimedOut: boolean }> => {
  const CHECKIN_MAX_TIMEOUT = ms('20s');

  logInfo(`[${transactionId}] [SERVICE] [checkin] initiated`);

  const apiKey = await getSecret(eventServiceConfig.secretKeyName);

  try {
    if (
      !checkinParams.employeeId ||
      !checkinParams.visitId ||
      !checkinParams.tenantId ||
      !checkinParams.checkinTime ||
      !checkinParams.cvid
    ) {
      throw new Error('Missing required checkin params');
    }

    const response = await axios.post<ProcuraCheckinCheckoutResponseType>(
      `${eventServiceConfig.endpoint}/api/v1/employees/${checkinParams.employeeId}/visits/${checkinParams.visitId}/checkin`,
      {
        ...checkinParams,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          [`${eventServiceConfig.apiKeyHeader}`]: `${apiKey}`,
          'X-Transaction-Id': transactionId,
        },
        timeout: CHECKIN_MAX_TIMEOUT,
        params: {
          fallback: shouldFallbackSync ? 'synchronous' : '',
        },
      },
    );

    await cacheService.batchRemove(transactionId, [
      {
        serviceName: 'visitService',
        identifier: `${checkinParams.visitId}_${checkinParams.tenantId}`,
      },
      {
        serviceName: 'clientService',
        identifier: `${checkinParams.clientId}_${checkinParams.tenantId}`,
      },
      {
        serviceName: 'clientService',
        identifier: `${checkinParams.clientPsId}`,
      },
    ]);

    if (!response.data.success) {
      throw new Error(`Checkin for ${checkinParams.cvid} failed`);
    }

    return { cvid: checkinParams.cvid, isTimedOut: false };
  } catch (checkinErr) {
    if (checkinErr.code === 'ECONNABORTED') {
      logError(`[${transactionId}] [SERVICE] [checkin] checkin timed out, reason: ${checkinErr.message}`);

      return {
        isTimedOut: true,
        cvid: checkinParams.cvid,
      };
    }

    logError(
      `[${transactionId}] [SERVICE] [checkin] checkin FAILED for visitId: ${checkinParams.visitId}, reason: ${checkinErr.message}`,
    );
    logError(
      `[${transactionId}] [SERVICE] [checkin] checkin FAILED for employeeId: ${checkinParams.employeeId}, reason: ${checkinErr.message}`,
    );
    logError(`[${transactionId}] [SERVICE] [checkin] checkin FAILED details: ${JSON.stringify(checkinParams)}`);

    throw checkinErr;
  }
};

const checkout = async (
  transactionId: string,
  checkoutParams: CheckoutToSystemType,
  shouldFallbackSync?: boolean,
): Promise<{ cvid: string; isTimedOut: boolean }> => {
  const CHECKOUT_MAX_TIMEOUT = ms('20s');

  logInfo(`[${transactionId}] [SERVICE] [checkout] initiated`);

  const apiKey = await getSecret(eventServiceConfig.secretKeyName);

  try {
    if (
      !checkoutParams.employeeId ||
      !checkoutParams.visitId ||
      !checkoutParams.tenantId ||
      !checkoutParams.checkoutTime ||
      !checkoutParams.cvid
    ) {
      throw new Error('Missing required checkin params');
    }

    const response = await axios.post<ProcuraCheckinCheckoutResponseType>(
      `${eventServiceConfig.endpoint}/api/v1/employees/${checkoutParams.employeeId}/visits/${checkoutParams.visitId}/checkout`,
      {
        ...checkoutParams,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          [`${eventServiceConfig.apiKeyHeader}`]: `${apiKey}`,
          'X-Transaction-Id': transactionId,
        },
        timeout: CHECKOUT_MAX_TIMEOUT,
        params: {
          fallback: shouldFallbackSync ? 'synchronous' : '',
        },
      },
    );

    await cacheService.batchRemove(transactionId, [
      {
        serviceName: 'visitService',
        identifier: `${checkoutParams.visitId}_${checkoutParams.tenantId}`,
      },
      {
        serviceName: 'clientService',
        identifier: `${checkoutParams.clientId}_${checkoutParams.tenantId}`,
      },
      {
        serviceName: 'clientService',
        identifier: `${checkoutParams.clientPsId}`,
      },
    ]);

    if (!response.data.success) {
      throw new Error(`Checkout for ${checkoutParams.cvid} failed`);
    }

    return { cvid: checkoutParams.cvid, isTimedOut: false };
  } catch (checkoutErr) {
    if (checkoutErr.code === 'ECONNABORTED') {
      logError(`[${transactionId}] [SERVICE] [checkout] Checkout timed out, reason: ${checkoutErr.message}`);

      return {
        isTimedOut: true,
        cvid: checkoutParams.cvid,
      };
    }

    logError(
      `[${transactionId}] [SERVICE] [checkout] checkout FAILED for visitId: ${checkoutParams.visitId}, reason: ${checkoutErr.message}`,
    );
    logError(
      `[${transactionId}] [SERVICE] [checkout] checkout FAILED for employeeId: ${checkoutParams.employeeId}, reason: ${checkoutErr.message}`,
    );
    logError(`[${transactionId}] [SERVICE] [checkout] checkout FAILED details: ${JSON.stringify(checkoutParams)}`);

    throw checkoutErr;
  }
};

const storeFailedCheckInOutInTemp = async (
  transactionId: string,
  attemptIdentifier: { cvid: string; psId: string; tenantId: string; mode: 'checkin' | 'checkout' },
  failedPayload: JSONLikeType,
): Promise<void> => {
  logInfo(
    `[${transactionId}] [SERVICE] [storeFailedCheckinOutInTemp] Recording a failed attempt for psId: ${
      attemptIdentifier.psId
    } and cvid: ${attemptIdentifier.cvid}, props: ${JSON.stringify(failedPayload)}`,
  );

  try {
    await tempDataService.addTempData(transactionId, {
      primaryIdentifier: prefixFailedVisitAttempt(
        attemptIdentifier.cvid,
        attemptIdentifier.tenantId,
        attemptIdentifier.psId,
      ),
      valueType: TempDataValueEnum.Visit,
      payload: failedPayload,
      valueStatus: ActiveStateEnum.Rejected,
    });

    logInfo(
      `[${transactionId}] [SERVICE] [storeFailedCheckinOutInTemp] Entry added successfully cvid: ${attemptIdentifier.cvid}, tenantId: ${attemptIdentifier.tenantId}`,
    );
  } catch (writeErr) {
    logError(`[${transactionId}] [SERVICE] [storeFailedCheckinOutInTemp] Failed writing to temp data`);
  }
};

const getVisitByCvidAndTenantId = async (
  transactionId: string,
  {
    cvid,
    tenantId,
    employeeId,
    visitStartDate,
    visitEndDate,
    systemType,
  }: {
    cvid: string;
    tenantId: string;
    employeeId: string;
    visitStartDate: Date;
    visitEndDate: Date;
    systemType: string;
  },
): Promise<VisitFromSystemType> => {
  try {
    logInfo(`[${transactionId}] [SERVICE] [getVisitByCvidAndTenantId] initiated`);

    if (!cvid || !tenantId || !employeeId) {
      throw new Error('Cannot perform query without cvid, employeeId or tenantId');
    }

    const apiKey = await getSecret(eventServiceConfig.secretKeyName);

    const startDateFormatted = formatDate(visitStartDate, 'yyyy-MM-dd');
    const endDateFormatted = formatDate(visitEndDate, 'yyyy-MM-dd');

    logInfo(
      `[${transactionId}] [SERVICE] [getVisitByCvidAndTenantId] request parameters: ${JSON.stringify({
        cvid,
        tenantId,
        employeeId,
        startDateFormatted,
        endDateFormatted,
        systemType,
      })}`,
    );

    const response = await axios.get<VisitFromSystemType>(
      `${eventServiceConfig.endpoint}/api/v1/employees/${employeeId}/visits/cvid/${cvid}`,
      {
        headers: {
          'Content-Type': 'application/json',
          [`${eventServiceConfig.apiKeyHeader}`]: `${apiKey}`,
        },
        params: {
          cvid,
          tenantId,
          employeeId,
          visitStartDate,
          visitEndDate,
          systemType: 'procura',
        },
      },
    );

    if (!response.data) {
      logError(`[${transactionId}] [SERVICE] [getVisitByCvidAndTenantId] no response received`);

      throw new Error('No visits received');
    }

    logInfo(
      `[${transactionId}] [SERVICE] [getVisitByCvidAndTenantId] SUCCESSFUL, results: ${JSON.stringify(response.data)}`,
    );

    return response.data;
  } catch (fetchErr) {
    logError(`[${transactionId}] [SERVICE] [getVisitByCvidAndTenantId] FAILED, reason: ${fetchErr.message}`);

    throw fetchErr;
  }
};

const createVisitNote = async (transactionId: string, notePayload: CreateNoteType): Promise<void> => {
  const apiKey = await getSecret(eventServiceConfig.secretKeyName);

  try {
    logInfo(`[${transactionId}] [SERVICE] [createVisitNote] Initiating note creation`);

    if (notePayload.noteForBranch.noteType === NoteTypeEnum.PrivateProgressNotes) {
      logInfo(
        `[${transactionId}] [SERVICE] [createVisitNote] Private Progress Note found for employeeId: ${notePayload.employeeId}, tenantId: ${notePayload.tenantId}`,
      );

      await tempDataService.addTempData(
        transactionId,
        {
          primaryIdentifier: notePayload.visitId,
          valueType: TempDataValueEnum.TempProgressNote,
          secondaryIdentifier: notePayload.tenantId,
          valueStatus: ActiveStateEnum.Pending,
          payload: notePayload,
        },
        {
          shouldOverride: false,
        },
      );

      logInfo(
        `[${transactionId}] [SERVICE] [createVisitNote] Private Progress Note found and skipped sending to kafka`,
      );

      return;
    }

    const response = await axios.post(
      `${eventServiceConfig.endpoint}/api/v1/employees/${notePayload.employeeId}/visits/${notePayload.visitId}/notes`,
      notePayload,
      {
        headers: {
          'Content-Type': 'application/json',
          [`${eventServiceConfig.apiKeyHeader}`]: `${apiKey}`,
          'X-Transaction-Id': transactionId,
        },
      },
    );

    logInfo(`[${transactionId}] [SERVICE] [createVisitNote] SUCCESSFUL, result: ${JSON.stringify(response.data)}`);
  } catch (err) {
    logError(`[${transactionId}] [SERVICE] [createVisitNote] Failed to create note: ${err.message}`);
    throw err;
  }
};

export {
  getSystemVisitsByDates,
  getVisitByVisitIdAndTenantId,
  procuraCheckInCheckOut,
  getMatchingVisitForEmployeeIdsAndTenantIds,
  getWrittenVisitByVisitIdAndTenantId,
  storeFailedCheckInOutInTemp,
  resetCheckin,
  checkin,
  checkout,
  getVisitByCvidAndTenantId,
  createVisitNote,
};
