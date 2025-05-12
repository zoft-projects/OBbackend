import { AudienceEnum, MilestoneTypeEnum, PriorityEnum } from '../../enums';
import {
  OBMilestoneInteractionUpsertOperationType,
  OBMilestoneOperationType,
  OBMilestoneSchemaType,
} from '../../types';
import { createNanoId } from '../../utils';

const generateMilestoneUpsertOperationEntry = (
  overrideProps: Partial<OBMilestoneOperationType> = {},
): OBMilestoneOperationType => {
  const sampleMilestoneData: OBMilestoneOperationType = {
    batchId: `MSBA0${createNanoId(5)}`,
    milestoneTasks: [
      {
        audienceLevel: AudienceEnum.Branch,
        milestoneTitle: 'Test Milestone',
        milestoneDescription: 'Description for Test Milestone 1',
        approach: MilestoneTypeEnum.Specific,
        priority: PriorityEnum.High,
        milestoneId: `MS0${createNanoId(5)}`,
        branchIds: ['101', '102'],
        startDate: new Date(),
        isDeleted: false,
      },
    ],
  };

  return { ...sampleMilestoneData, ...overrideProps };
};

const generateMilestoneInteractionUpsertOperationEntry = (): OBMilestoneInteractionUpsertOperationType[] => {
  const sampleMilestoneInteractionsData: OBMilestoneInteractionUpsertOperationType[] = [
    {
      batchId: 'B-101',
      employeePsId: '0001020012',
      milestoneId: 'M-123',
    },
    {
      batchId: 'B-101',
      employeePsId: '0001020013',
      milestoneId: 'M-124',
    },
    {
      batchId: 'B-101',
      employeePsId: '0001020014',
      milestoneId: 'M-125',
    },
  ];

  return sampleMilestoneInteractionsData;
};

const generateMilestoneSchemaType = (overrideProps: Partial<OBMilestoneSchemaType> = {}): OBMilestoneSchemaType => {
  const sampleMilestoneData: OBMilestoneSchemaType = {
    batchId: `MSBA0${createNanoId(5)}`,
    audienceLevel: AudienceEnum.Branch,
    milestoneTitle: 'Test Milestone',
    milestoneDescription: 'Description for Test Milestone 1',
    approach: MilestoneTypeEnum.Specific,
    priority: PriorityEnum.High,
    milestoneId: `MS0${createNanoId(5)}`,
    branchIds: ['101', '102'],
    startDate: new Date(),
    isDeleted: false,
    createdByPsId: {
      employeePsId: 'MS02',
      displayName: 'Test',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return { ...sampleMilestoneData, ...overrideProps };
};

export {
  generateMilestoneInteractionUpsertOperationEntry,
  generateMilestoneUpsertOperationEntry,
  generateMilestoneSchemaType,
};
