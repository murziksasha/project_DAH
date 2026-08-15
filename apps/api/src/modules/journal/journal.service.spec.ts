import { BadRequestException } from '@nestjs/common';
import { JournalEntryType } from '@prisma/client';
import { JournalService } from './journal.service';

describe('JournalService.assertBalanced', () => {
  const service = new JournalService({} as never);

  it('accepts balanced two-line entry', () => {
    expect(() =>
      service.assertBalanced([
        { account: 'cash', debit: 100 },
        { account: 'receivable', credit: 100 },
      ]),
    ).not.toThrow();
  });

  it('rejects unbalanced entry', () => {
    expect(() =>
      service.assertBalanced([
        { account: 'cash', debit: 100 },
        { account: 'receivable', credit: 50 },
      ]),
    ).toThrow(BadRequestException);
  });

  it('rejects both debit and credit on one line', () => {
    expect(() =>
      service.assertBalanced([
        { account: 'cash', debit: 50, credit: 50 },
      ]),
    ).toThrow(BadRequestException);
  });

  it('rejects empty lines', () => {
    expect(() => service.assertBalanced([])).toThrow(BadRequestException);
  });
});

describe('JournalService.write idempotency', () => {
  it('returns existing entry on same idempotency key', async () => {
    const existing = {
      id: 'je1',
      idempotencyKey: 'Payment:p1:payment',
      lines: [],
    };
    const prisma = {
      journalEntry: {
        findUnique: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
        aggregate: jest.fn(),
      },
      ledgerAccount: { findMany: jest.fn() },
    };
    const service = new JournalService(prisma as never);
    const result = await service.write({
      type: JournalEntryType.payment,
      refType: 'Payment',
      refId: 'p1',
      lines: [
        { account: 'cash', debit: 10 },
        { account: 'receivable', credit: 10 },
      ],
    });
    expect(result).toBe(existing);
    expect(prisma.journalEntry.create).not.toHaveBeenCalled();
  });
});

describe('JournalService.reconcile', () => {
  it('returns ok when no apartments/funds/payments and balanced TB', async () => {
    const prisma = {
      apartment: { findMany: jest.fn().mockResolvedValue([]) },
      fund: { findMany: jest.fn().mockResolvedValue([]) },
      payment: { findMany: jest.fn().mockResolvedValue([]) },
      expense: { findMany: jest.fn().mockResolvedValue([]) },
      journalLine: { findMany: jest.fn().mockResolvedValue([]) },
      journalEntry: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      accrualLine: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new JournalService(prisma as never);
    const result = await service.reconcile();
    expect(result.ok).toBe(true);
    expect(result.mismatchCount).toBe(0);
    expect(result.trialBalance.balanced).toBe(true);
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
      expense: { findMany: jest.fn().mockResolvedValue([]) },
      journalLine: {
        findMany: jest.fn().mockImplementation((args: { where?: { account?: string } }) => {
          if (args?.where?.account === 'advance') {
            return Promise.resolve([{ debit: 0, credit: 10 }]);
          }
          return Promise.resolve([]);
        }),
      },
      journalEntry: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      accrualLine: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new JournalService(prisma as never);
    const result = await service.reconcile();
    expect(result.ok).toBe(false);
    expect(result.mismatches[0].kind).toBe('advance');
    expect(result.mismatches[0].legacy).toBe(50);
    expect(result.mismatches[0].journal).toBe(10);
  });

  it('flags unbalanced journal entry', async () => {
    const prisma = {
      apartment: { findMany: jest.fn().mockResolvedValue([]) },
      fund: { findMany: jest.fn().mockResolvedValue([]) },
      payment: { findMany: jest.fn().mockResolvedValue([]) },
      expense: { findMany: jest.fn().mockResolvedValue([]) },
      journalLine: {
        findMany: jest.fn().mockResolvedValue([
          { account: 'cash', debit: 100, credit: 0 },
          { account: 'expense', debit: 0, credit: 50 },
        ]),
      },
      journalEntry: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'bad',
            description: 'broken',
            lines: [
              { debit: 100, credit: 0 },
              { debit: 0, credit: 50 },
            ],
          },
        ]),
      },
      accrualLine: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new JournalService(prisma as never);
    const result = await service.reconcile();
    expect(result.ok).toBe(false);
    expect(result.mismatches.some((m) => m.kind === 'entry_balance')).toBe(true);
  });
});

describe('JournalService.trialBalance', () => {
  it('aggregates by account', async () => {
    const prisma = {
      journalLine: {
        findMany: jest.fn().mockResolvedValue([
          { account: 'cash', debit: 100, credit: 0, fundId: null, apartmentId: null },
          { account: 'cash', debit: 0, credit: 40, fundId: null, apartmentId: null },
          { account: 'expense', debit: 40, credit: 0, fundId: null, apartmentId: null },
          { account: 'fund_balance', debit: 0, credit: 100, fundId: null, apartmentId: null },
        ]),
      },
    };
    const service = new JournalService(prisma as never);
    const tb = await service.trialBalance('b1');
    expect(tb.balanced).toBe(true);
    expect(tb.totalDebit).toBe(140);
    expect(tb.totalCredit).toBe(140);
    const cash = tb.accounts.find((a) => a.account === 'cash');
    expect(cash?.debit).toBe(100);
    expect(cash?.credit).toBe(40);
    expect(cash?.balance).toBe(60);
  });
});
