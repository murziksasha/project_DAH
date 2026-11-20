import { BuildingService } from './building.service';

describe('BuildingService - Portfolio Summary Aggregations & Request Scoping', () => {
  function createService(prismaMock: any) {
    const auditMock = { log: jest.fn().mockResolvedValue({}) };
    return new BuildingService(prismaMock, auditMock as any);
  }

  it('scopes requests strictly to buildingId and does not duplicate unassigned requests per building', async () => {
    const buildings = [
      { id: 'bld-1', name: 'Будинок 1', address: 'вул. Миру 1', _count: { apartments: 10 } },
      { id: 'bld-2', name: 'Будинок 2', address: 'вул. Миру 2', _count: { apartments: 20 } },
    ];

    const countMock = jest.fn().mockImplementation((args: any) => {
      // Building 1
      if (args.where?.buildingId === 'bld-1' && !args.where?.dueAt) return Promise.resolve(5);
      if (args.where?.buildingId === 'bld-1' && args.where?.dueAt) return Promise.resolve(2);
      // Building 2
      if (args.where?.buildingId === 'bld-2' && !args.where?.dueAt) return Promise.resolve(3);
      if (args.where?.buildingId === 'bld-2' && args.where?.dueAt) return Promise.resolve(1);
      // Unassigned
      if (args.where?.buildingId === null && !args.where?.dueAt) return Promise.resolve(4);
      if (args.where?.buildingId === null && args.where?.dueAt) return Promise.resolve(1);
      return Promise.resolve(0);
    });

    const aggregateMock = jest.fn().mockImplementation((args: any) => {
      if (args.where?.status?.in) {
        // open lines
        return Promise.resolve({ _sum: { amount: 100000, paidAmount: 40000 } });
      }
      if (args.where?.status === 'paid') {
        // closed lines
        return Promise.resolve({ _sum: { amount: 500000, paidAmount: 500000 } });
      }
      return Promise.resolve({ _sum: { amount: 0, paidAmount: 0 } });
    });

    const prisma = {
      building: {
        findMany: jest.fn().mockResolvedValue(buildings),
      },
      apartment: {
        findMany: jest.fn().mockResolvedValue([{ id: 'apt-1' }, { id: 'apt-2' }]),
      },
      accrualLine: {
        aggregate: aggregateMock,
        findMany: jest.fn(), // Should not be called with take: 5000 anymore!
      },
      request: {
        count: countMock,
      },
    };

    const service = createService(prisma);
    const result = await service.getPortfolioSummary('tenant-1');

    // 1. Check building request scoping: buildingId must be exact, no OR: [{ buildingId }, { buildingId: null }]
    for (const call of countMock.mock.calls) {
      expect(call[0].where).not.toHaveProperty('OR');
    }

    // 2. Check buildings return exact scoped counts
    expect(result.buildings[0].openRequests).toBe(5);
    expect(result.buildings[0].overdueRequests).toBe(2);
    expect(result.buildings[1].openRequests).toBe(3);
    expect(result.buildings[1].overdueRequests).toBe(1);

    // 3. Check totals: 4 (unassigned) + 5 (bld-1) + 3 (bld-2) = 12 total open requests
    expect(result.totals.openRequests).toBe(12);
    // Overdue totals: 1 (unassigned) + 2 (bld-1) + 1 (bld-2) = 4 total overdue
    expect(result.totals.overdueRequests).toBe(4);

    // 4. Check collection rate and debt calculated via SQL aggregates
    expect(prisma.accrualLine.findMany).not.toHaveBeenCalled();
    expect(aggregateMock).toHaveBeenCalled();
    // Billed = open (1000) + paid (5000) = 6000; Paid = 400 + 5000 = 5400; Rate = (5400 / 6000) * 100 = 90%
    expect(result.buildings[0].collectionRate).toBe(90);
    // Debt = open amount (100000) - open paid (40000) = 60000 kopiiky
    expect(result.buildings[0].debt).toBe(60000);
  });
});
