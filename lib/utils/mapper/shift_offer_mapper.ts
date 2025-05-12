import { ShiftOfferConsumerType, OfferEventConsumerType, ClientFromSystemType } from '../../types';

export const mapShiftOfferDetailsTypeToShiftOfferDetailsPayloadType = (
  shiftOfferDetails: ShiftOfferConsumerType,
  client: ClientFromSystemType,
): ShiftOfferConsumerType => {
  const mappedData = {} as ShiftOfferConsumerType;
  if (shiftOfferDetails.id) {
    mappedData.id = shiftOfferDetails.id;
  }
  if (shiftOfferDetails.offerId) {
    mappedData.offerId = shiftOfferDetails.offerId;
  }

  if (shiftOfferDetails.serviceRequested) {
    mappedData.serviceRequested = shiftOfferDetails.serviceRequested;
  }

  if (shiftOfferDetails.visitOccurrenceType) {
    mappedData.visitOccurrenceType = shiftOfferDetails.visitOccurrenceType;
  }

  if (shiftOfferDetails.tenantId) {
    mappedData.tenantId = shiftOfferDetails.tenantId;
  }

  if (shiftOfferDetails.systemType) {
    mappedData.systemType = shiftOfferDetails.systemType;
  }

  if (shiftOfferDetails.employeePsId) {
    mappedData.employeePsId = shiftOfferDetails.employeePsId;
  }

  if (shiftOfferDetails.startDate) {
    mappedData.startDate = shiftOfferDetails.startDate;
  }

  if (shiftOfferDetails.endDate) {
    mappedData.endDate = shiftOfferDetails.endDate;
  }

  if (shiftOfferDetails.empTimeZone) {
    mappedData.empTimeZone = shiftOfferDetails.empTimeZone;
  }

  if (shiftOfferDetails.expiryDate) {
    mappedData.expiryDate = shiftOfferDetails.expiryDate;
  }

  if (shiftOfferDetails.status) {
    mappedData.status = shiftOfferDetails.status;
  }

  if (shiftOfferDetails.clientPsId) {
    mappedData.clientPsId = shiftOfferDetails.clientPsId;
  }

  if (shiftOfferDetails.clientId) {
    mappedData.clientId = shiftOfferDetails.clientId;
  }

  if (shiftOfferDetails.offers) {
    mappedData.offers = shiftOfferDetails.offers.map((offer) => {
      const mappedOffer = {} as OfferEventConsumerType;

      if (offer.activityType) {
        mappedOffer.activityType = offer.activityType;
      }

      if (offer.startDate) {
        mappedOffer.startDate = offer.startDate;
      }

      if (offer.endDate) {
        mappedOffer.endDate = offer.endDate;
      }

      if (offer.startTime) {
        mappedOffer.startTime = offer.startTime;
      }

      if (offer.endTime) {
        mappedOffer.endTime = offer.endTime;
      }

      if (offer.recurringType) {
        mappedOffer.recurringType = offer.recurringType;
      }

      if (offer.repeatFrequency) {
        mappedOffer.repeatFrequency = offer.repeatFrequency;
      }

      if (offer.shiftId) {
        mappedOffer.shiftId = offer.shiftId;
      }

      if (offer.recurrenceCode) {
        mappedOffer.recurrenceCode = offer.recurrenceCode;
      }

      if (offer.status) {
        mappedOffer.status = offer.status;
      }

      if (offer.isTimeSpecific) {
        mappedOffer.isTimeSpecific = offer.isTimeSpecific;
      }

      return mappedOffer;
    });
  }

  if (client) {
    if (client.address) {
      mappedData.address = client.address;
    }
    if (client.risksForCaregivers) {
      mappedData.risksForCaregivers = (client.risksForCaregivers ?? []).map((risk) => ({
        riskId: risk.id,
        risk: risk.description,
        riskDetails: risk.comment,
        intakeUser: risk.reportedIntakeUser,
      }));
    }

    if (client.gender) {
      mappedData.gender = client.gender;
    }

    if (client.hobbies) {
      mappedData.hobbies = client.hobbies;
    }

    if (client.servicePreferences) {
      mappedData.clientPreferences = client.servicePreferences;
    }
  }

  return mappedData;
};
