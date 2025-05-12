import { OfferTypeEnum } from '../../enums/offer_enum';

type OffersPayloadType = {
  tenantId: string;
  // Visit details
  visit: {
    visitId: string;
    visitOfferId: string;
    visitOfferListId: string;
    visitScheduleId: string;
    visitSchedule: string;
  };
  // Offer details
  offer: {
    offerType: OfferTypeEnum;
    offerTypeMessage?: string;
    offerLocation: string;
    offerDueDate: string;
  };
  // Client details
  client: {
    clientId: string;
    clientPsId: string;
    clientName: string;
    clientPhone?: string;
    clientStatus: string;
    clientAddress: {
      address: string;
      city: string;
      province: string;
      postalCode: string;
      country: string;
    };
    directionNotes?: string;
  };
};

export { OffersPayloadType };
