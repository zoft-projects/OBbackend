import { ActiveStateEnum } from '../../enums';
import * as Model from '../../models';
import { OBTempDataSchemaType } from '../../types';

describe('Unit test for TempData Model', () => {
  it('should create a record in the mongo collection', async () => {
    const data: OBTempDataSchemaType = {
      primaryIdentifier: 'test123',
      valueType: 'test',
      valueStatus: ActiveStateEnum.Active,
      version: '1.1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const sampleTempRecord = new Model.OBTempDataModel(data);

    await sampleTempRecord.save();

    expect(sampleTempRecord._id).toBeDefined();
    expect(sampleTempRecord.primaryIdentifier).toBe('test123');
    expect(sampleTempRecord.valueType).toBe('test');
  });

  it('should retrieve data by filter query', async () => {
    const data: OBTempDataSchemaType = {
      primaryIdentifier: 'test123',
      valueType: 'test',
      valueStatus: ActiveStateEnum.Active,
      version: '1.1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const sampleTempRecord = new Model.OBTempDataModel(data);

    await sampleTempRecord.save();

    const [firstMatchingItem] = await Model.OBTempDataModel.find({
      primaryIdentifier: 'test123',
      valueType: 'test',
    });

    expect(firstMatchingItem).toBeDefined();
    expect(firstMatchingItem.primaryIdentifier).toBe('test123');
    expect(firstMatchingItem.valueType).toBe('test');
  });
});
