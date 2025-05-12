import * as offerFactory from './offer_factory';

describe('offerFactory', () => {
  describe('generateSingleVisitOffer', () => {
    it('should provide a single visit offer', () => {
      const offer = offerFactory.generateSingleVisitOffer();
      expect(offer).toBeDefined();
      expect(offer.offer.offerType).toEqual('SingleVisit');
    });

    it('should override fields for a single visit offer', () => {
      const overrideClientName = 'John Doe Override';
      const offer = offerFactory.generateSingleVisitOffer({
        client: {
          clientName: overrideClientName,
        },
      });

      expect(offer.client.clientName).toEqual(overrideClientName);
    });
  });

  describe('generateRecurringVisitOffer', () => {
    it('should provide a recurring visit offer', () => {
      const offer = offerFactory.generateRecurringVisitOffer();
      expect(offer).toBeDefined();
      expect(offer.offer.offerType).toEqual('RecurringVisit');
    });

    it('should override fields for a recurring visit offer', () => {
      const overrideOfferLocation = '456 Override St, Testville, TX';
      const offer = offerFactory.generateRecurringVisitOffer({
        offer: {
          offerLocation: overrideOfferLocation,
        },
      });

      expect(offer.offer.offerLocation).toEqual(overrideOfferLocation);
    });
  });

  describe('Common fields validation', () => {
    it('should have valid ids and fields', () => {
      const singleVisitOffer = offerFactory.generateSingleVisitOffer();
      const recurringVisitOffer = offerFactory.generateRecurringVisitOffer();

      // Validate common fields in Single Visit Offer
      expect(singleVisitOffer.tenantId).toBeDefined();
      expect(singleVisitOffer.visit.visitId).toBeDefined();
      expect(singleVisitOffer.client.clientId).toBeDefined();

      // Validate common fields in Recurring Visit Offer
      expect(recurringVisitOffer.tenantId).toBeDefined();
      expect(recurringVisitOffer.visit.visitId).toBeDefined();
      expect(recurringVisitOffer.client.clientId).toBeDefined();
    });
  });
});
