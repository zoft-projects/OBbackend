import { OBBranchSchemaType } from '../../types';
import { createSampleAddress } from '../../utils';

/**
 * Factory Name: branch_factory
 * Description: This factory is to provide sample data for branches
 */

const generateRandomBranchDBEntry = (overrideProps: Partial<OBBranchSchemaType> = {}): OBBranchSchemaType => {
  const randomAddress = createSampleAddress();

  // TODO Generate branchIds between 148 to 384
  const sampleBranch: OBBranchSchemaType = {
    branchName: 'Bayshore Home Health - Mississauga, ON',
    branchId: '148',
    city: randomAddress.city,
    province: randomAddress.state,
    divisionIds: ['D0001'],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return { ...sampleBranch, ...overrideProps };
};

const generateRandomBranchDBEntries = (
  count = 10,
  overrideProps: Partial<OBBranchSchemaType> = {},
): OBBranchSchemaType[] => {
  const sampleBranches: OBBranchSchemaType[] = [];

  for (let i = 0; i < count; i += 1) {
    sampleBranches.push(generateRandomBranchDBEntry(overrideProps));
  }

  return sampleBranches;
};

export { generateRandomBranchDBEntry, generateRandomBranchDBEntries };
