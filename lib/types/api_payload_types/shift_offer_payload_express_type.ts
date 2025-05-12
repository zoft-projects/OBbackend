import { ShiftOfferStatusEnum } from '../../enums';
import { ServiceRequestedType, VisitOccurrenceType } from '../api_consumer_types/shift_offer_consumer_type';

export type ClientAddressType = {
  streetAddress1: string;
  streetAddress2?: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
};

export type ShiftOffersPayloadType = {
  shiftOfferId: string;
  visitId: string;
  serviceRequested: ServiceRequestedType;
  visitOccurrenceType: string;
  employeePsId: string;
  startDate: Date;
  endDate: Date;
  empTimeZone?: string;
  expiryDate: Date;
  status: string;
  clientPsId?: string;
  clientId?: string;
  clientAddress: ClientAddressType;
};

export type ShiftOfferDetailsPayloadType = {
  shiftOfferId: string;
  visitId: string;
  serviceRequested: ServiceRequestedType;
  visitOccurrenceType: string;
  tenantId: string;
  employeePsId: string;
  empTimeZone: string;
  startDate: Date;
  endDate: Date;
  expiryDate: Date;
  status: string;
  clientDetails: {
    gender: string;
    clientPsId: string;
    clientAddress: ClientAddressType;
    preferences: {
      likes: string[];
      dislikes: string[];
    };
  };
};

export type ShiftOfferResponsePayloadType = {
  employeeId: string;
  scheduleId: string;
  tenantId: string;
  visitOfferId: string;
  visitOfferListId: string;
  responseStatus: ShiftOfferStatusEnum;
  responseType: VisitOccurrenceType;
  responseDateTime: Date;
  responseReason?: string;
  employeeName: string;
};

export type ShiftOfferEmployeeResponseType = {
  rejectedOffers?: {
    reasonType?: string;
    otherReason?: string;
    offers: { shiftId: string; recurrenceCode: string }[];
  }[];
  acceptedOffers?: { shiftId: string; recurrenceCode: string }[];
};
