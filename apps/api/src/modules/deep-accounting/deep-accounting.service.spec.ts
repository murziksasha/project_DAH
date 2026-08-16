import { DeepAccountingService } from './deep-accounting.service';

describe('DeepAccountingService.arAging', () => {
  it('buckets open debt by dueDate', async () => {
    const now = new Date('2026-08-15T12:00:00Z');
    jest.useFakeTimers().setSystemTime(now);

    const prisma = {
      apartment: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'a1', number: '1', entrance: 1, advanceBalance: 0 },
        ]),
      },
      accrualLine: {
        findMany: jest.fn().mockResolvedValue([
          {
            apartmentId: 'a1',
            amount: 100,
            paidAmount: 0,
            dueDate: new Date('2026-08-10'),
            accrual: { period: '2026-07', title: 'Утримання', fundId: 'f1' },
          },
          {
            apartmentId: 'a1',
            amount: 50,
            paidAmount: 0,
            dueDate: new Date('2026-06-01'),
            accrual: { period: '2026-05', title: 'Утримання', fundId: 'f1' },
          },
          {
            apartmentId: 'a1',
            amount: 200,
            paidAmount: 0,
            dueDate: new Date('2026-03-01'),
            accrual: { period: '2026-02', title: 'Утримання', fundId: 'f1' },
          },
        ]),
      },
    };

    const svc = new DeepAccountingService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const result = await svc.arAging('b1');
    expect(result.totalDebt).toBe(350);
    expect(result.buckets.d1_30).toBe(100);
    expect(result.buckets.d61_90).toBe(50);
    expect(result.buckets.d90_plus).toBe(200);
    jest.useRealTimers();
  });
});
