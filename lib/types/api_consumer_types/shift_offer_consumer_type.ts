import { ShiftOfferStatusEnum, RecurringTypeEnum } from '../../enums';

enum VisitOccurrenceType {
  singleVisit = 'SingleVisit',
  recurringVisit = 'RecurringVisit',
}

type ServiceRequestedType = {
  serviceId: string;
  serviceName: string;
};

type ShiftOfferDetailsType = {
  shiftOfferId: string;
  visitId: string;
  serviceRequested: ServiceRequestedType;
  visitOccurrenceType: string;
  tenantId: string;
  systemType: string;
  employeePsId: string;
  empTimeZone?: string;
  startDate: Date;
  endDate: Date;
  expiryDate: Date;
  status: ShiftOfferStatusEnum;
  reasonType?: string;
  otherReason?: string;
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

type ClientAddressType = {
  streetAddress1: string;
  streetAddress2?: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
};

type ShiftOfferConsumerType = {
  id: string;
  offerId: string;
  serviceRequested: string;
  visitOccurrenceType: VisitOccurrenceType;
  tenantId: string;
  clientPsId: string;
  clientId: string;
  systemType: string;
  employeePsId: string;
  startDate: string;
  endDate?: string;
  empTimeZone: string;
  expiryDate: string;
  status: ShiftOfferStatusEnum;
  offers: OfferEventConsumerType[];
  // Risks and Hazards
  risksForCaregivers?: {
    riskId: string;
    risk: string;
    riskDetails?: string;
    intakeUser?: string;
  }[];
  address: {
    streetAddress1: string;
    streetAddress2?: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
  };
  gender?: string;
  hobbies?: string;
  clientPreferences?: {
    serviceOnStatHoliday?: boolean;
    pcgGenderPreference?: string;
    serviceVisitAvailability?: string;
    interaction?: string[];
    lastUpdatedDate?: string;
    spokenLanguage?: string;
    ageBracketForCaregiver?: string;
    petInHome?: boolean;
    allowSmoking?: boolean;
    allowPerfumes?: boolean;
    serviceAddress?: {
      streetAddress1: string;
      streetAddress2?: string;
      city: string;
      state: string;
      country: string;
      postalCode: string;
      streetAddress: string;
    };
    serviceAddressChange?: boolean;
    startDate?: string;
    endDate?: string;
    petList?: string;
  };
};

type OfferEventConsumerType = {
  activityType?: string[];
  startDate: string;
  endDate?: string;
  startTime: string;
  endTime: string;
  isTimeSpecific?: string;
  recurringType?: RecurringTypeEnum;
  repeatFrequency: string;
  shiftId: string;
  recurrenceCode: string;
  status?: ShiftOfferStatusEnum;
};

export {
  VisitOccurrenceType,
  ShiftOfferDetailsType,
  ServiceRequestedType,
  ShiftOfferConsumerType,
  OfferEventConsumerType,
};
