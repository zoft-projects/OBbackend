import { getApiService, getAuthHeaders } from '../../../testUtils';
import { visitsFactory } from '../../factories';
import * as clientService from '../../services/client_service/client_service';
import * as featureProvisioningService from '../../services/feature_provisioning_service/feature_provisioning_service';
import * as visitService from '../../services/visit_service/visit_service';
import { VisitDetailPayloadType } from '../../types';

describe('Integration test for visits feature', () => {
  const apiService = getApiService();

  const mockVisitAndClient = (overrideProps: Partial<VisitDetailPayloadType> = {}, shouldError = false) => {
    const { visitId, tenantId, client, risks, careplans } = overrideProps;

    const randomCareplans = careplans?.map((careplan) => ({
      activityId: careplan.careplanId,
      name: careplan.careplan,
      status: careplan.careplanStatus,
      detailedDesc: careplan.careplanDetails,
    }));

    const randomRisks = risks?.map((risk) => ({
      id: risk.riskId,
      description: risk.risk,
      reportedIntakeUser: risk.intakeUser,
      comment: risk.riskDetails,
      reportedByEmployeePsId: '',
    }));

    const randomVisit = visitsFactory.generateRandomVisitFromSystem({
      visitId,
      tenantId,
      clientId: client?.clientId,
      adlChecklist: randomCareplans ?? [],
    });

    const randomClients = [
      visitsFactory.generateRandomClientFromSystem({
        clientId: randomVisit.clientId,
        peopleSoftId: randomVisit.clientPsId,
        tenantId: randomVisit.tenantId,
        risksForCaregivers: randomRisks ?? [],
      }),
    ];

    jest.spyOn(visitService, 'getVisitByVisitIdAndTenantId').mockImplementation(async () => {
      if (shouldError) {
        throw new Error();
      }

      return randomVisit;
    });

    jest.spyOn(visitService, 'getMatchingVisitForEmployeeIdsAndTenantIds').mockImplementation(async () => {
      if (shouldError) {
        throw new Error();
      }

      return randomVisit;
    });

    jest.spyOn(clientService, 'getClientDetailByClientAndTenantIds').mockImplementation(async () => {
      if (shouldError) {
        throw new Error();
      }

      return randomClients;
    });

    jest.spyOn(featureProvisioningService, 'getProvisionForBranchId').mockImplementation(async () => {
      if (shouldError) {
        throw new Error();
      }

      return true;
    });

    return {
      visit: randomVisit,
      clients: randomClients,
    };
  };

  describe('GET /visits/:visitId/details', () => {
    it('should throw auth error without valid token', async () => {
      const expiredToken = await getAuthHeaders({ isExpired: true });

      const response = await apiService
        .get('/onebay-api/api/v3/visits/M0000123/details')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(response.statusCode).toEqual(401);
      expect(response.body.message).toEqual('Access token invalid or expired');
    });

    it("should throw error if visit doesn't exist", async () => {
      const authToken = await getAuthHeaders();

      mockVisitAndClient(undefined, true);

      const response = await apiService
        .get('/onebay-api/api/v3/visits/RANDOM000123/details')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.statusCode).toEqual(500);
    });

    it('should return visit and client details successfully', async () => {
      const visitId = 'M000012345';

      const authToken = await getAuthHeaders();
      const {
        visit,
        clients: [createdClient],
      } = mockVisitAndClient({
        visitId,
      });

      const response = await apiService
        .get(`/onebay-api/api/v3/visits/${visitId}/details`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.statusCode).toEqual(200);

      expect(response.body.visit.visitId).toEqual(visitId);
      expect(response.body.visit.tenantId).toEqual(visit.tenantId);
      expect(response.body.visit.cvid).toEqual(visit.cvid);
      expect(response.body.visit.availableActionStatus).toEqual('Unknown');

      expect(response.body.client.clientId).toEqual(createdClient.clientId);
      expect(response.body.client.clientPsId).toEqual(createdClient.peopleSoftId);

      expect(response.body.risks).toEqual([]);
      expect(response.body.careplans).toEqual([]);
    }, 5000);

    it('should return risks successfully', async () => {
      const visitId = 'M000012345';
      const tenantId = 'Procura_Leapfrog';

      const authToken = await getAuthHeaders();
      mockVisitAndClient({
        visitId,
        tenantId,
        risks: [
          {
            riskId: 'R00123',
            risk: 'Violent/Aggressive Client',
            riskDetails: 'Mitigation: Call daughter at 647-999-9999 before arrival.',
          },
        ],
      });

      const response = await apiService
        .get(`/onebay-api/api/v3/visits/${visitId}/details`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(response.statusCode).toEqual(200);
      expect(response.body.risks).toEqual([
        {
          riskId: 'R00123',
          risk: 'Violent/Aggressive Client',
          riskDetails: 'Mitigation: Call daughter at 647-999-9999 before arrival.',
        },
      ]);
    }, 5000);

    it('should return careplans successfully', async () => {
      const visitId = 'M000012345';
      const tenantId = 'Procura_Leapfrog';

      const authToken = await getAuthHeaders();
      mockVisitAndClient({
        visitId,
        tenantId,
        careplans: [
          {
            careplanId: 'CP1234',
            careplan: 'Safety Check',
            careplanStatus: 'not-done',
            careplanDetails: '1. Are there concerns?\n2.Please take garbage out!',
            highlight: false,
          },
        ],
        risks: [
          {
            riskId: 'R00123',
            risk: 'Violent/Aggressive Client',
            riskDetails: 'Mitigation: Call daughter at 647-999-9999 before arrival.',
          },
        ],
      });

      const response = await apiService
        .get(`/onebay-api/api/v3/visits/${visitId}/details`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(response.statusCode).toEqual(200);
      expect(response.body.careplans).toEqual([
        {
          careplanId: 'CP1234',
          careplan: 'Safety Check',
          careplanStatus: 'not-done',
          careplanDetails: '1. Are there concerns?\n2.Please take garbage out!',
          highlight: false,
        },
      ]);
    }, 5000);
  });
});
