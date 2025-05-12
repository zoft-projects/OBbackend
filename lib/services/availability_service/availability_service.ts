import axios, { AxiosResponse } from 'axios';
import config from 'config';
import { format } from 'date-fns';
import { logInfo, logError } from '../../log/util';
import {
  CreateOnetimeAvailabilityType,
  CreateRecurringAvailabilityType,
  DetailedOnetimeAvailabilityType,
  ScheduleSummaryGetType,
  ServiceConfigType,
} from '../../types';
import { getSecret } from '../../vendors';

const availabilityServiceConfig: ServiceConfigType = config.get('Services.availabilityService');

const eventServiceConfig: ServiceConfigType = config.get('Services.eventService');

// This method calls the Availability microservice
const getSchedulesFromAvailabilityService = async (
  transactionId: string,
  scheduleDetails: {
    systemIdentifiers: { tenantId: string; systemName: string; empSystemId: string }[];
    startDate: Date;
    endDate: Date;
  },
): Promise<ScheduleSummaryGetType[] | null> => {
  try {
    const schedulesApiKey = await getSecret(availabilityServiceConfig.secretKeyName);

    logInfo(
      `[${transactionId}] [SERVICE] getSchedulesFromAvailabilityService - Fetching user from availability microservice`,
    );

    let summarySchedules = [] as ScheduleSummaryGetType[];

    await Promise.all(
      (scheduleDetails.systemIdentifiers || []).map(async (system) => {
        // calling a post call as we are creating schedule summaries if the dates in the query is missing in them

        const response = await axios.post(
          `${availabilityServiceConfig.baseUri}/api/v1/schedule/calculate/${system.empSystemId}/${
            system.tenantId
          }?startDate=${format(scheduleDetails.startDate, 'yyyy-MM-dd')}&endDate=${format(
            scheduleDetails.endDate,
            'yyyy-MM-dd',
          )}`,
          {},
          {
            headers: {
              'Content-Type': 'application/json',
              [availabilityServiceConfig.apiKeyHeader]: schedulesApiKey,
              'X-Transaction-Id': transactionId,
              Host: availabilityServiceConfig.host,
            },
          },
        );

        logInfo(`[${transactionId}] [SERVICE] getSchedulesFromAvailabilityService SUCCESSFUL`);
        summarySchedules = [...summarySchedules, ...response.data];
      }),
    );

    if (summarySchedules.length === 0) {
      throw new Error('Schedules not found for the employee');
    }

    return summarySchedules as ScheduleSummaryGetType[];
  } catch (fetchErr) {
    logError(`[${transactionId}] [SERVICE] getSchedulesFromAvailabilityService FAILED, reason: ${fetchErr.message}`);

    return null;
  }
};

const createOnetimeForEmployeeId = async (
  transactionId: string,
  systemIdentifier: { tenantId: string; systemName: string; empSystemId: string },
  createOnetimeDetails: CreateOnetimeAvailabilityType,
): Promise<string> => {
  logInfo(
    `[${transactionId}] [SERVICE] updateOnetimeForEmployeeId - Updating one time availability for tenantId:${systemIdentifier.tenantId}, employee Id:${systemIdentifier.empSystemId}`,
  );
  const updateAvailabilityApiKey = await getSecret(eventServiceConfig.secretKeyName);

  const response: AxiosResponse<string> = await axios.post(
    `${eventServiceConfig.endpoint}/api/v1/availability/${systemIdentifier.empSystemId}/${systemIdentifier.tenantId}`,
    createOnetimeDetails,
    {
      headers: {
        'Content-Type': 'application/json',
        [eventServiceConfig.apiKeyHeader]: updateAvailabilityApiKey,
      },
    },
  );

  logInfo(
    `[${transactionId}] [SERVICE] updateOnetimeForEmployeeId SUCCESSFUL for employeeId: ${systemIdentifier.empSystemId}`,
  );

  return response.data;
};

const createRecurringAvailabilityForEmployeeId = async (
  transactionId: string,
  systemIdentifier: { tenantId: string; systemName: string; empSystemId: string },
  createRecurringAvailabilityDetails: CreateRecurringAvailabilityType,
): Promise<string> => {
  logInfo(
    `[${transactionId}] [SERVICE] updateRecurringAvailabilityForEmployeeId - Updating recurring availability for tenantId:${systemIdentifier.tenantId}, employee Id:${systemIdentifier.empSystemId}`,
  );
  const updateAvailabilityApiKey = await getSecret(eventServiceConfig.secretKeyName);

  const response: AxiosResponse<string> = await axios.post(
    `${eventServiceConfig.endpoint}/api/v1/availability/${systemIdentifier.empSystemId}/${systemIdentifier.tenantId}`,
    createRecurringAvailabilityDetails,
    {
      headers: {
        'Content-Type': 'application/json',
        [eventServiceConfig.apiKeyHeader]: updateAvailabilityApiKey,
      },
      params: { availabilityType: 'recurring' },
    },
  );

  logInfo(
    `[${transactionId}] [SERVICE] updateRecurringAvailabilityForEmployeeId SUCCESSFUL for employeeId: ${systemIdentifier.empSystemId}`,
  );

  return response.data;
};

const createOnetimeAvailabilities = async (
  transactionId: string,
  systemIdentifiers: { tenantId: string; systemName: string; empSystemId: string }[],
  createOnetimeDetails: CreateOnetimeAvailabilityType,
): Promise<{ success: boolean; updatedEmployeeIds: string[] }> => {
  try {
    const updatedEmployeeIds: string[] = [];

    logInfo(
      `[${transactionId}] [SERVICE] updateOnetimeAvailabilities - Updating one time availabilities for ${systemIdentifiers}`,
    );

    const responses: PromiseSettledResult<string>[] = await Promise.allSettled(
      (systemIdentifiers || []).map((system) =>
        createOnetimeForEmployeeId(transactionId, system, createOnetimeDetails),
      ),
    );

    responses.forEach((response) => {
      if (response.status === 'fulfilled') {
        updatedEmployeeIds.push(response.value);
      }
      if (response.status === 'rejected') {
        logError(`[${transactionId}] [SERVICE] updateOnetimeAvailabilities FAILED for ${response.reason}`);
      }
    });

    logInfo(
      `[${transactionId}] [SERVICE] updateOnetimeAvailabilities SUCCESSFUL for ${JSON.stringify(updatedEmployeeIds)}`,
    );

    return {
      success: updatedEmployeeIds.length === systemIdentifiers.length,
      updatedEmployeeIds,
    };
  } catch (fetchErr) {
    logError(`[${transactionId}] [SERVICE] updateOnetimeAvailabilities FAILED, reason: ${fetchErr.message}`);

    return { success: false, updatedEmployeeIds: [] };
  }
};

const createRecurringAvailabilities = async (
  transactionId: string,
  systemIdentifiers: { tenantId: string; systemName: string; empSystemId: string }[],
  createRecurringAvailabilityDetails: CreateRecurringAvailabilityType,
): Promise<{ success: boolean; updatedEmployeeIds: string[] }> => {
  try {
    const updatedEmployeeIds: string[] = [];

    logInfo(
      `[${transactionId}] [SERVICE] updateRecurringAvailabilities - Updating recurring availabilities for ${systemIdentifiers}`,
    );

    const responses: PromiseSettledResult<string>[] = await Promise.allSettled(
      (systemIdentifiers || []).map((system) =>
        createRecurringAvailabilityForEmployeeId(transactionId, system, createRecurringAvailabilityDetails),
      ),
    );

    responses.forEach((response) => {
      if (response.status === 'fulfilled') {
        updatedEmployeeIds.push(response.value);
      }
      if (response.status === 'rejected') {
        logError(`[${transactionId}] [SERVICE] updateRecurringAvailabilities FAILED for ${response.reason}`);
      }
    });

    logInfo(
      `[${transactionId}] [SERVICE] updateRecurringAvailabilities SUCCESSFUL for ${JSON.stringify(updatedEmployeeIds)}`,
    );

    return {
      success: updatedEmployeeIds.length === systemIdentifiers.length,
      updatedEmployeeIds,
    };
  } catch (fetchErr) {
    logError(`[${transactionId}] [SERVICE] updateRecurringAvailabilities FAILED, reason: ${fetchErr.message}`);

    return { success: false, updatedEmployeeIds: [] };
  }
};

const getOnetimeAvailabilities = async (
  transactionId: string,
  systemIdentifiers: { tenantId: string; systemName: string; empSystemId: string }[],
  status: string,
): Promise<DetailedOnetimeAvailabilityType[] | null> => {
  try {
    const updateAvailabilityApiKey = await getSecret(eventServiceConfig.secretKeyName);

    logInfo(
      `[${transactionId}] [SERVICE] getOnetimeAvailabilities - Fetching onetime availabilities from event microservice`,
    );

    let onetimeAvailabilities = [] as DetailedOnetimeAvailabilityType[];

    await Promise.all(
      (systemIdentifiers || []).map(async (system) => {
        const response = await axios.get(
          `${eventServiceConfig.endpoint}/api/v1/availability/${system.empSystemId}/${system.tenantId}?status=${status}`,
          {
            headers: {
              'Content-Type': 'application/json',
              [eventServiceConfig.apiKeyHeader]: updateAvailabilityApiKey,
            },
          },
        );

        logInfo(`[${transactionId}] [SERVICE] getOnetimeAvailabilities SUCCESSFUL`);
        onetimeAvailabilities = [...onetimeAvailabilities, ...response.data];
      }),
    );

    if (onetimeAvailabilities.length === 0) {
      throw new Error('No availabilities found for the employee');
    }

    return onetimeAvailabilities as DetailedOnetimeAvailabilityType[];
  } catch (fetchErr) {
    logError(`[${transactionId}] [SERVICE] getOnetimeAvailabilities FAILED, reason: ${fetchErr.message}`);

    return [];
  }
};

export {
  getSchedulesFromAvailabilityService,
  createOnetimeAvailabilities,
  getOnetimeAvailabilities,
  createRecurringAvailabilities,
};
