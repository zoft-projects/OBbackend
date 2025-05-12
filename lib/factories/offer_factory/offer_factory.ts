// Import required enums and types
import { OfferTypeEnum } from '../../enums/offer_enum';
import { OffersPayloadType } from '../../types';
import { createNanoId, createSampleName, createSamplePhone, createSampleAddress } from '../../utils';

/**
 * Factory Name: offer_factory
 * Description: This factory is to provide sample data for offers
 */

// Utility function to generate a common base for all offers
const generateBaseOffer = (overrideProps: Partial<OffersPayloadType> = {}): OffersPayloadType => {
  const sampleAddress = createSampleAddress();

  return {
    tenantId: `tenant${createNanoId(3)}`,
    visit: {
      visitId: `visit${createNanoId(4)}`,
      visitOfferId: `offer${createNanoId(4)}`,
      visitOfferListId: `offerList${createNanoId(4)}`,
      visitScheduleId: `schedule${createNanoId(4)}`,
      visitSchedule: new Date().toISOString(),
    },
    offer: {
      offerType: OfferTypeEnum.SingleVisit, // Default, can be overridden
      offerLocation: `${sampleAddress.address}, ${sampleAddress.city}`,
      offerDueDate: new Date().toISOString().split('T')[0], // Example format: "YYYY-MM-DD"
    },
    client: {
      clientId: `client${createNanoId(4)}`,
      clientPsId: `ps${createNanoId(5)}`,
      clientName: createSampleName(),
      clientPhone: createSamplePhone(),
      clientStatus: 'Active',
      clientAddress: {
        address: sampleAddress.address,
        city: sampleAddress.city,
        province: sampleAddress.state,
        postalCode: sampleAddress.zip,
        country: 'CA',
      },
    },
    ...overrideProps,
  };
};

// Factory method for generating a Single Visit Offer mock data
const generateSingleVisitOffer = (overrideProps: Partial<OffersPayloadType> = {}): OffersPayloadType => {
  return generateBaseOffer({
    ...overrideProps,
    offer: {
      ...overrideProps.offer,
      offerType: OfferTypeEnum.SingleVisit,
    },
  });
};

// Factory method for generating a Recurring Visit Offer mock data
const generateRecurringVisitOffer = (overrideProps: Partial<OffersPayloadType> = {}): OffersPayloadType => {
  return generateBaseOffer({
    ...overrideProps,
    offer: {
      ...overrideProps.offer,
      offerType: OfferTypeEnum.RecurringVisit,
    },
  });
};

const generateRandomMockOffers = (limit = 10): OffersPayloadType[] => {
  const mockData: OffersPayloadType[] = [];
  for (let i = 0; i < limit / 2; i++) {
    const singleVisitOffer = generateSingleVisitOffer();
    mockData.push(singleVisitOffer);
    const recurringVisitOffer = generateRecurringVisitOffer();
    mockData.push(recurringVisitOffer);
  }

  return mockData;
};

export { generateSingleVisitOffer, generateRecurringVisitOffer, generateRandomMockOffers };
