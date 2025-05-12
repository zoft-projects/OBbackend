import axios from 'axios';
import config from 'config';
import { logInfo, logError } from '../../log/util';
import { ServiceConfigType, ShiftOfferResponsePayloadType } from '../../types';
import { getSecret } from '../../vendors';

const eventServiceConfig: ServiceConfigType = config.get('Services.eventService');

const sendShiftOfferResponseToEventService = async (
  transactionId: string,
  offerResponse: ShiftOfferResponsePayloadType,
): Promise<{ visitOfferId: string; visitOfferListId: string; employeeId: string; tenantId: string }> => {
  try {
    logInfo(
      `[${transactionId}] [SERVICE] sendShiftOfferResponseToEventService - send visit shift offer ${offerResponse.visitOfferId}`,
    );
    const apiKey = await getSecret(eventServiceConfig.secretKeyName);

    const response = await axios.put(
      `${eventServiceConfig.endpoint}/api/v1/employees/${offerResponse.employeeId}/offers/${offerResponse.visitOfferId}`,
      {
        scheduleId: offerResponse.scheduleId,
        dbTenantName: offerResponse.tenantId,
        visitOfferListId: offerResponse.visitOfferListId,
        responseStatus: offerResponse.responseStatus,
        responseType: offerResponse.responseType,
        responseDateTime: offerResponse.responseDateTime,
        responseReason: offerResponse.responseReason,
        employeeName: offerResponse.employeeName,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          [eventServiceConfig.apiKeyHeader]: apiKey,
        },
      },
    );

    if (!response.data) {
      throw new Error(
        `[${transactionId}] [SERVICE] sendShiftOfferResponseToEventService - Failed to send shift offer to event-service-sam`,
      );
    }
    const { visitOfferId, visitOfferListId, employeeId, tenantId } = response.data;

    logInfo(
      `[${transactionId}] [SERVICE] sendShiftOfferResponseToEventService - SUCCESSFUL for visitOfferId: ${visitOfferId}, employeeId: ${employeeId}`,
    );

    return {
      visitOfferId,
      visitOfferListId,
      employeeId,
      tenantId,
    };
  } catch (postError) {
    logError(
      `[${transactionId}] [SERVICE] sendShiftOfferResponseToEventService - FAILED, reason: ${postError.message}`,
    );

    return null;
  }
};

export { sendShiftOfferResponseToEventService };
