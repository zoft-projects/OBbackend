import axios from 'axios';
import config from 'config';
import { logInfo, logError } from '../../log/util';
import { ShiftOfferEmployeeResponseType, ServiceConfigType, ShiftOfferConsumerType } from '../../types';
import { getSecret } from '../../vendors';

const employeeServiceConfig: ServiceConfigType = config.get('Services.employeeService');

const getShiftOffers = async (
  transactionId: string,
  employeePsId: string,
  filters?: {
    lastCursorId?: string;
    limit: number;
    serviceRequested?: string;
    visitOccurrenceType: string;
    status?: string;
  },
): Promise<ShiftOfferConsumerType[] | null> => {
  try {
    logInfo(`[${transactionId}] [SERVICE] getShiftOffers - Fetching shiftOffers for employeePsid: ${employeePsId}`);
    const apiKey = await getSecret(employeeServiceConfig.apiKeyHeader);
    const queryFilters: { employeePsId: string; hideExpiredOffersBefore?: string } = {
      employeePsId,
    };

    if (filters?.status === 'PENDING') {
      queryFilters.hideExpiredOffersBefore = new Date().toISOString();
    }

    if (filters) {
      Object.keys(filters).forEach((key) => {
        if (filters[key]) {
          queryFilters[key] = filters[key];
        }
      });
    }
    const response = await axios.get<ShiftOfferConsumerType[]>(
      `${employeeServiceConfig.endpoint}/api/v1/shift-offer/`,
      {
        headers: {
          'Content-Type': 'application/json',
          [`${employeeServiceConfig.apiKeyHeader}`]: `${apiKey}`,
        },
        params: queryFilters,
      },
    );

    logInfo(
      `[${transactionId}] [SERVICE] getShiftOffers - SUCCESSFUL for employeePsId: ${employeePsId} and fetched ${
        response?.data?.length || 0
      } records`,
    );

    if (!response.data) {
      logError(`[${transactionId}] [SERVICE] getShiftOffers - ShiftOffers not found`);

      return [];
    }

    return response.data;
  } catch (fetchErr) {
    logError(`[${transactionId}] [SERVICE] getShiftOffers - FAILED, reason: ${fetchErr.message}`);

    return [];
  }
};

const getShiftOfferById = async (
  transactionId: string,
  employeePsId: string,
  shiftOfferId: string,
): Promise<ShiftOfferConsumerType | null> => {
  try {
    logInfo(`[${transactionId}] [SERVICE] getShiftOfferById - fetching shiftOffer with shiftOfferId ${shiftOfferId}`);

    const apiKey = await getSecret(employeeServiceConfig.apiKeyHeader);

    const response = await axios.get<ShiftOfferConsumerType | null>(
      `${employeeServiceConfig.endpoint}/api/v1/shift-offer/${employeePsId}/${shiftOfferId}`,
      {
        headers: {
          'Content-Type': 'application/json',
          [`${employeeServiceConfig.apiKeyHeader}`]: `${apiKey}`,
        },
      },
    );

    logInfo(`[${transactionId}] [SERVICE] getShiftOfferById - SUCCESSFUL`);

    if (!response.data) {
      throw new Error(`[${transactionId}] [SERVICE] getShiftOfferById - ShiftOffer not found`);
    }

    return response.data;
  } catch (fetchErr) {
    logError(`[${transactionId}] [SERVICE] getShiftOfferById - FAILED, reason: ${fetchErr.message}`);

    return null;
  }
};

const sendShiftOfferResponse = async (
  transactionId: string,
  employeePsId: string,
  shiftOfferId: string,
  payload: ShiftOfferEmployeeResponseType,
): Promise<boolean> => {
  try {
    logInfo(
      `[${transactionId}] [SERVICE] sendShiftOfferResponse - send visit reschedule with employeePsId ${employeePsId}`,
    );

    const apiKey = await getSecret(employeeServiceConfig.apiKeyHeader);

    const response = await axios.post<boolean>(
      `${employeeServiceConfig.endpoint}/api/v1/shift-offer/${employeePsId}/${shiftOfferId}/accept-reject`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          [`${employeeServiceConfig.apiKeyHeader}`]: `${apiKey}`,
        },
      },
    );

    logInfo(`[${transactionId}] [SERVICE] sendShiftOfferResponse - SUCCESSFUL`);

    if (!response.data) {
      throw new Error(`[${transactionId}] [SERVICE] sendShiftOfferResponse - Failed to send visit reschedule signal`);
    }

    return response.data;
  } catch (fetchErr) {
    logError(`[${transactionId}] [SERVICE] sendShiftOfferResponse - FAILED, reason: ${fetchErr.message}`);

    return null;
  }
};

export { getShiftOfferById, getShiftOffers, sendShiftOfferResponse };
