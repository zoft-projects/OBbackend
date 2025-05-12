import { OBFeatureSummariesModel } from '../../models';
import { featureSummariesService } from '../../services';
import { OBFeatureSummariesUpsertOperationType } from '../../types';

jest.mock('../../services/temp_data_service/temp_data_service');

const transactionId = 'test-transaction';

describe('addSummaryByDay', () => {
  it('should throw an error if required fields are missing', async () => {
    const featureSummariesWithMissingFields = {
      summaryId: 'S-101',
      metricEndDate: new Date(),
      metricName: '',
      captureType: 'daily',
      captureIdentifier: 'identifier-123',
      metricPayload: {},
      metricStartDate: new Date(),
    };

    // Call the function and expect it to throw an error
    await expect(
      featureSummariesService.addSummaryByDay(transactionId, featureSummariesWithMissingFields),
    ).rejects.toThrow('Feature summary must have a valid metricName');
  });

  it('should throw an error if feature summaries request is empty or not provided', async () => {
    // Call addSummaryByDay with an empty request
    await expect(
      featureSummariesService.addSummaryByDay(transactionId, {} as OBFeatureSummariesUpsertOperationType),
    ).rejects.toThrow('The mandatory field "featureSummaries" is missing or empty');
  });

  it('should successfully create feature summaries even when sampleReference is missing', async () => {
    const featureSummariesWithoutSampleReference: OBFeatureSummariesUpsertOperationType = {
      summaryId: 'S-101',
      metricStartDate: new Date(),
      metricEndDate: new Date(),
      metricName: 'Sample Metric',
      captureType: 'daily',
      captureIdentifier: 'identifier-123',
      metricPayload: {},
      // Optional field 'sampleReference' is missing
    };

    const createdResult = await featureSummariesService.addSummaryByDay(
      transactionId,
      featureSummariesWithoutSampleReference,
    );

    // Verify the feature summaries were inserted
    const insertedFeatureSummaries = await OBFeatureSummariesModel.find({});

    const [insertedSummary] = insertedFeatureSummaries;

    expect(insertedSummary).toBeDefined();
    expect(insertedSummary.sampleReference).toBeUndefined();
    expect(insertedSummary.summaryId).toEqual(featureSummariesWithoutSampleReference.summaryId);
    expect(insertedSummary.metricStartDate).toEqual(featureSummariesWithoutSampleReference.metricStartDate);
    expect(insertedSummary.metricEndDate).toEqual(featureSummariesWithoutSampleReference.metricEndDate);
    expect(createdResult).toEqual(insertedSummary.summaryId);
  });

  it('should successfully update existing feature summaries', async () => {
    const fixedDate = new Date('2024-10-27T18:30:00.000Z');

    const existingSummary = new OBFeatureSummariesModel({
      summaryId: 'S-101',
      metricStartDate: fixedDate, // Use fixedDate here
      metricEndDate: fixedDate, // Use fixedDate here
      metricName: 'Updated Metric',
      captureType: 'daily',
      captureIdentifier: 'identifier-123',
      metricPayload: {},
    });
    await existingSummary.save();

    const updatedFeatureSummaries: OBFeatureSummariesUpsertOperationType = {
      summaryId: 'S-101',
      metricStartDate: fixedDate, // Use fixedDate here
      metricEndDate: fixedDate, // Use fixedDate here
      metricName: 'Updated Metric',
      captureType: 'daily',
      captureIdentifier: 'identifier-123',
      metricPayload: {},
    };

    const updatedResult = await featureSummariesService.addSummaryByDay(transactionId, updatedFeatureSummaries);

    // Verify the feature summary was updated
    const updatedSummary = await OBFeatureSummariesModel.findOne({ summaryId: 'S-101' });

    expect(updatedSummary).toBeDefined();
    expect(updatedSummary!.metricName).toEqual(updatedFeatureSummaries.metricName);
    expect(updatedSummary!.metricStartDate.toISOString()).toEqual(fixedDate.toISOString()); // Check against fixedDate
    expect(updatedSummary!.metricEndDate.toISOString()).toEqual(fixedDate.toISOString()); // Check against fixedDate
    expect(updatedResult).toEqual(updatedSummary!.summaryId);
  });
});
