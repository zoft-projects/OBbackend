import { getApiService, getAuthHeaders } from '../../../testUtils';
import { supportTicketFactory } from '../../factories';
import * as Model from '../../models';
import { supportTicketService } from '../../services';
import { OBSupportTicketSchemaType } from '../../types';
import { mapSupportTicketServiceRequestToDBRecord, repeatMethod } from '../../utils';

describe('Integration test for support ticket feature', () => {
  const apiService = getApiService();
  const createSampleTickets = async (count = 1) => {
    return Promise.all(
      repeatMethod<Promise<Partial<OBSupportTicketSchemaType>>>(async () => {
        const supportTicket = mapSupportTicketServiceRequestToDBRecord(
          supportTicketFactory.generateSupportTicketUpsertOperationEntry(),
        );
        await new Model.OBSupportTicketModel(supportTicket).save();

        return supportTicket;
      }, count),
    );
  };

  describe('GET /support-tickets/:ticketRefId', () => {
    it('should return null for invalid ticketRefId', async () => {
      // Create samples in db
      await createSampleTickets();

      const mockToken = await getAuthHeaders();

      const response = await apiService
        .get('/onebay-api/api/v3/support-tickets/INVALID_ID_123')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.statusCode).toEqual(200);
      expect(response.body).toBeFalsy();
      expect(response.body).toEqual(null);
    });

    it('should get ticket by ticketRefId successfully', async () => {
      const [supportTicket] = await createSampleTickets();

      const mockToken = await getAuthHeaders();

      const response = await apiService
        .get(`/onebay-api/api/v3/support-tickets/${supportTicket.ticketRefId}`)
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.statusCode).toEqual(200);
      expect(response.body).toBeTruthy();
      expect(response.body.ticketRefId).toEqual(supportTicket.ticketRefId);
    }, 5000);
  });

  describe('GET /support-tickets', () => {
    it('should return all tickets', async () => {
      const supportTickets = await createSampleTickets(2);

      const mockToken = await getAuthHeaders();

      const response = await apiService
        .get('/onebay-api/api/v3/support-tickets')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.statusCode).toEqual(200);
      expect(response.body).toBeTruthy();
      expect(response.body).toHaveLength(supportTickets.length);
    }, 5000);

    it('should return all filtered tickets', async () => {
      const supportTickets = await createSampleTickets(2);

      const [firstSupportTicket] = supportTickets;

      const mockToken = await getAuthHeaders();

      const response = await apiService
        .get(`/onebay-api/api/v3/support-tickets?search=${firstSupportTicket.ticketRefId}`)
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.statusCode).toEqual(200);
      expect(response.body).toBeTruthy();
      expect(response.body).not.toHaveLength(supportTickets.length);
      expect(response.body).toHaveLength(1);
    }, 5000);
  });

  describe('POST /support-ticket', () => {
    it('should create a new ticket successfully', async () => {
      // Mock the sendSupportTicketEmail function
      jest.spyOn(supportTicketService, 'sendSupportTicketEmail').mockResolvedValue('mockedMessageId');

      const mockToken = await getAuthHeaders();

      const response = await apiService
        .post('/onebay-api/api/v3/support-tickets')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          title: 'New Ticket',
          description: 'Description of the ticket',
          ticketType: 'Task',
          priority: 'Low',
          ticketStatus: 'Open',
          initiatorType: 'User',
        });

      expect(response.body).toBeTruthy();
      expect(response.statusCode).toEqual(200);

      // Querying from the BD to ensure that the ticket is created.
      const [matchingTicketInDB] = await Model.OBSupportTicketModel.find({
        ticketRefId: response.body,
      });

      expect(matchingTicketInDB.title).toEqual('New Ticket');
      expect(matchingTicketInDB.ticketType).toEqual('Task');

      expect(supportTicketService.sendSupportTicketEmail).toHaveBeenCalled();
    }, 5000);

    it('should handle required fields are missing when creating a new ticket', async () => {
      const mockToken = await getAuthHeaders();
      const response = await apiService
        .post('/onebay-api/api/v3/support-tickets')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          // missing required fields ticketType,priority, ticketStatus and initiatorType
          title: 'New Ticket',
          description: 'Description of the ticket',
        });

      expect(response.statusCode).toEqual(500);
      expect(response.body.message).toEqual('Required fields are missing');
    }, 5000);
  });

  describe('PUT /support-ticket', () => {
    it('should update the ticket successfully', async () => {
      const [supportTicket] = await createSampleTickets();
      const mockToken = await getAuthHeaders();

      const response = await apiService
        .put(`/onebay-api/api/v3/support-tickets/${supportTicket.ticketRefId}`)
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          ticketRefId: supportTicket.ticketRefId,
          title: 'Updated Ticket',
          description: 'Update the ticket by using ticketRefId of the ticket.',
        });

      expect(response).toBeTruthy();
      expect(response.statusCode).toEqual(200);
      expect(response.body).toEqual(supportTicket.ticketRefId);
    }, 5000);

    it('should handle the ticketRefId is missing', async () => {
      const [supportTicket] = await createSampleTickets();
      const mockToken = await getAuthHeaders();

      const response = await apiService
        .put(`/onebay-api/api/v3/support-tickets/${supportTicket.ticketRefId}`)
        .set('Authorization', `Bearer ${mockToken}`)
        .send({
          // missing ticketRefId
          title: 'Updated Ticket',
          description: 'Trying to update the ticket without ticketRefId',
        });

      expect(response.statusCode).toEqual(500);
      expect(response.body.message).toEqual(
        'Unable to map ticket to a suitable format, please provide mandatory field ticketRefId!',
      );
    }, 5000);
  });
});
