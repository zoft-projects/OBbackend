import { MilestoneTypeEnum, PriorityEnum } from '../../enums';
import { milestoneFactory } from '../../factories';
import { OBMilestoneModel } from '../../models';
import * as Model from '../../models';
import { milestoneService } from '../../services';
import { OBMilestoneOperationType } from '../../types';

const transactionId = 'test-transaction';

describe('Unit test for milestoneService', () => {
  describe('getMilestonesForBranchIds', () => {
    it('should successfully retrieve empty milestones array for specified branchIds', async () => {
      const branchIds = ['247', '251'];

      // Call the function under test with the test data
      const result = await milestoneService.getMilestonesForBranchIds(transactionId, branchIds);

      // Assertions
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);

      expect(result).toHaveLength(2);

      result.forEach((item) => {
        // Check if each item has 'branchId' and 'milestones' properties
        expect(item).toHaveProperty('branchId');
        expect(item).toHaveProperty('milestones');
        expect(Array.isArray(item.milestones)).toBe(true);
        expect(item.milestones).toHaveLength(0);
        expect(branchIds).toContain(item.branchId);
      });

      // Ensure the result array matches the expected structure
      expect(result).toEqual([
        { branchId: '247', milestones: [] },
        { branchId: '251', milestones: [] },
      ]);
    });
  });

  describe('getPreviousMilestoneInteractions', () => {
    it('should throw an error if filters are missing or invalid', async () => {
      await expect(milestoneService.getPreviousMilestoneInteractions(transactionId, [])).rejects.toThrow(
        'The mandatory field filters are missing',
      );
    });

    it('should successfully retrieve empty array for previous milestone interactions', async () => {
      // Define filters for milestone interactions
      const filters = [
        {
          employeePsId: '0001020012',
          milestoneId: 'M-123',
          batchId: 'B-101',
        },
        {
          employeePsId: '0001020013',
          milestoneId: 'M-123',
          batchId: 'B-101',
        },
      ];

      // Retrieve previous milestone interactions based on defined filters
      const result = await milestoneService.getPreviousMilestoneInteractions(transactionId, filters);

      // Assertions
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);

      expect(result).toHaveLength(0);
    });
  });

  describe('getMilestonesByFilters', () => {
    it('should successfully retrieve empty milestones array for specified filter', async () => {
      const filter = { isDeleted: false };

      const mockMilestones = milestoneFactory.generateMilestoneSchemaType({
        batchId: 'MSBA0003',
      });

      const createdModelData = new Model.OBMilestoneModel(mockMilestones);

      const createdResult = await createdModelData.save();

      // Call the function under test with the test data
      const result = await milestoneService.getMilestonesByFilters(transactionId, filter);

      // Assertions
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);

      result.forEach((item) => {
        // Check if each item has 'branchId' and 'batchId' properties
        expect(item).toHaveProperty('branchIds');
        expect(item).toHaveProperty('batchId');
        expect(item.batchId).toBe(createdResult.batchId);
      });
    });
  });
  describe('createMilestones', () => {
    it('should throw an error if required fields are missing', async () => {
      // missing required field 'audienceLevel'
      const milestonesWithMissingFields = {
        batchId: 'B-101',
        milestoneTasks: [
          {
            milestoneTitle: 'Test Milestone Missing Fields',
            approach: MilestoneTypeEnum.Specific,
            milestoneDescription: 'Description for Test Milestone 3',
            priority: PriorityEnum.High,
            branchIds: ['247', '251'],
            startDate: new Date(),
            isDeleted: false,
          },
        ],
      };

      await expect(milestoneService.createMilestones(transactionId, milestonesWithMissingFields)).rejects.toThrow(
        'Each milestone must have a valid audienceLevel.',
      );
    });

    it('should throw an error if milestones request is empty or not provided', async () => {
      // Call createMilestones with empty milestones request
      await expect(
        milestoneService.createMilestones(transactionId, { milestoneTasks: [] } as OBMilestoneOperationType),
      ).rejects.toThrow('The mandatory field "milestones" is missing or empty');
    });

    it('should successfully create milestones', async () => {
      const mockMilestones = milestoneFactory.generateMilestoneUpsertOperationEntry({
        batchId: 'MSBA0001',
      });

      const createdResult = await milestoneService.createMilestones(transactionId, mockMilestones);
      // Verify the milestones were inserted
      const insertedMilestones = await OBMilestoneModel.find({});

      // Get The object from array's
      const [insertedMilestone] = insertedMilestones;
      const [mockMilestone] = mockMilestones.milestoneTasks;

      expect(insertedMilestone).toBeDefined();
      expect(insertedMilestone.milestoneId).toBeDefined();
      expect(insertedMilestone.batchId).toEqual(mockMilestones.batchId);
      expect(insertedMilestone.audienceLevel).toEqual(mockMilestone.audienceLevel);
      expect(insertedMilestone.approach).toEqual(mockMilestone.approach);
      expect(insertedMilestone.priority).toEqual(mockMilestone.priority);
      expect(insertedMilestones).toHaveLength(mockMilestones.milestoneTasks.length);
      expect(createdResult).toBe(mockMilestones.batchId);
    });
  });

  describe('createMilestoneInteractions', () => {
    it('should throw an error if interactions array is empty or invalid', async () => {
      await expect(milestoneService.createMilestoneInteractions(transactionId, [])).rejects.toThrow(
        'The mandatory field "interactions" is missing or empty',
      );
    });

    it('should throw an error if no valid interactions found', async () => {
      const invalidInteractions = [
        {
          batchId: '',
          employeePsId: '',
          milestoneId: '',
        },
      ];
      await expect(milestoneService.createMilestoneInteractions(transactionId, invalidInteractions)).rejects.toThrow(
        'No valid interactions found to create milestones',
      );
    });

    it('should successfully create valid milestone interactions and return them', async () => {
      const mockMilestoneInteractions = milestoneFactory.generateMilestoneInteractionUpsertOperationEntry();

      const createdInteractions = await milestoneService.createMilestoneInteractions(
        transactionId,
        mockMilestoneInteractions,
      );

      expect(createdInteractions).toBeDefined();
      expect(createdInteractions).toHaveLength(mockMilestoneInteractions.length);
    });
  });
});
