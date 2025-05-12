import { visitsFactory } from '.';

describe('visitsFactory', () => {
  it('should provide sample visits', () => {
    const visits = visitsFactory.generateRandomVisitsPayload(10);
    const visitsV2 = visitsFactory.generateRandomVisitsPayload(5);

    expect(visits).toHaveLength(10);
    expect(visitsV2).toHaveLength(5);
  });

  it('should have valid ids and fields', () => {
    const visits = visitsFactory.generateRandomVisitsPayload(1);
    const [visit] = visits;

    expect(visit).toBeDefined();
    expect(visit.clientPsId).toBeDefined();
    expect(visit.visitId).toBeDefined();
    expect(visit.visitStatus).toBeDefined();
    expect(visit.tenantId).toBeDefined();
    expect(visit.cvid).toBeDefined();
  });

  it('should override fields', () => {
    const visits = visitsFactory.generateRandomVisitsPayload(1, {
      cvid: 'TEST1234',
    });
    const [visit] = visits;

    expect(visit.cvid).toEqual('TEST1234');
  });
});
