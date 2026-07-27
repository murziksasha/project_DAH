import { JournalService } from './journal.service';

describe('JournalService.reconcile', () => {
  it('returns ok when no apartments/funds/payments', async () => {
    const prisma = {
      apartment: { findMany: jest.fn().mockResolvedValue([]) },
      fund: { findMany: jest.fn().mockResolvedValue([]) },
      payment: { findMany: jest.fn().mockResolvedValue([]) },
      journalLine: { findMany: jest.fn() },
      journalEntry: { findFirst: jest.fn() },
    };
    const service = new JournalService(prisma as never);
    const result = await service.reconcile();
    expect(result.ok).toBe(true);
    expect(result.mismatchCount).toBe(0);
  });

  it('flags advance mismatch', async () => {
    const prisma = {
      apartment: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'a1', number: '101', advanceBalance: 50 },
        ]),
      },
      fund: { findMany: jest.fn().mockResolvedValue([]) },
      payment: { findMany: jest.fn().mockResolvedValue([]) },
      journalLine: {
        findMany: jest.fn().mockResolvedValue([
          { debit: 0, credit: 10 },
        ]),
      },
      journalEntry: { findFirst: jest.fn() },
    };
    const service = new JournalService(prisma as never);
    const result = await service.reconcile();
    expect(result.ok).toBe(false);
    expect(result.mismatches[0].kind).toBe('advance');
    expect(result.mismatches[0].legacy).toBe(50);
    expect(result.mismatches[0].journal).toBe(10);
  });
});
