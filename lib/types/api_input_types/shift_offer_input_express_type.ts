import { ShiftOfferStatusEnum } from '../../enums';
import { OfferTypeEnum } from '../../enums/offer_enum';
import { VisitOccurrenceType } from '../api_consumer_types/shift_offer_consumer_type';

export type HTTPPutShiftOffersInputType = {
  scheduleId: string;
  offerType: OfferTypeEnum;
  visitOfferId: string;
  visitOfferListId: string;
  tenantId: string;
  reasonType?: string;
  otherReason?: string;
  responseStatus: ShiftOfferStatusEnum;
  responseType: VisitOccurrenceType;
  responseReason?: string;
};
