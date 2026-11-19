import { ForbiddenException } from '@nestjs/common';
import { AccountingPeriodStatus } from '../../prisma/client';
import { AccountingPeriodsService } from './accounting-periods.service';

describe('AccountingPeriodsService', () => {
  const prisma = {
    accountingPeriod: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    building: { findUnique: jest.fn() },
  };
  const audit = { log: jest.fn().mockResolvedValue({}) };
  const service = new AccountingPeriodsService(prisma as never, audit as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('periodKeyFromDate formats YYYY-MM UTC', () => {
    expect(service.periodKeyFromDate('2026-03-15T12:00:00.000Z')).toBe('2026-03');
  });

  it('assertAllowsMutation allows payment on soft_closed', async () => {
    prisma.accountingPeriod.findUnique.mockResolvedValue({
      status: AccountingPeriodStatus.soft_closed,
    });
    await expect(
      service.assertAllowsMutation('b1', '2026-03-01', 'payment'),
    ).resolves.toMatchObject({ status: AccountingPeriodStatus.soft_closed });
  });

  it('assertAllowsMutation blocks expense on soft_closed', async () => {
    prisma.accountingPeriod.findUnique.mockResolvedValue({
      status: AccountingPeriodStatus.soft_closed,
    });
    await expect(
      service.assertAllowsMutation('b1', '2026-03-01', 'expense'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('assertAllowsMutation blocks all on locked', async () => {
    prisma.accountingPeriod.findUnique.mockResolvedValue({
      status: AccountingPeriodStatus.locked,
    });
    await expect(
      service.assertAllowsMutation('b1', '2026-03-01', 'payment'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('missing period treated as open', async () => {
    prisma.accountingPeriod.findUnique.mockResolvedValue(null);
    await expect(
      service.assertAllowsMutation('b1', '2026-03-01', 'accrual'),
    ).resolves.toMatchObject({ status: AccountingPeriodStatus.open });
  });

  it('setStatus to locked calls closeChecklist and rejects when conditions fail', async () => {
    prisma.building.findUnique.mockResolvedValue({ id: 'b1', settings: {} });
    prisma.accountingPeriod.findUnique.mockResolvedValue({
      id: 'ap-1',
      buildingId: 'b1',
      period: '2026-03',
      status: AccountingPeriodStatus.open,
    });
    // mock closeChecklist to fail
    jest.spyOn(service, 'closeChecklist').mockResolvedValue({
      buildingId: 'b1',
      period: '2026-03',
      status: 'open',
      canSoftClose: false,
      canLock: false,
      strictBankRec: false,
      journalSot: false,
      checks: [{ id: 'pending_expenses', ok: false, label: 'Unapproved expenses', detail: 1 }],
      blocking: [{ id: 'pending_expenses', ok: false, label: 'Unapproved expenses', detail: 1 }],
    } as any);

    await expect(
      service.setStatus('b1', '2026-03', AccountingPeriodStatus.locked, 'u1', 'chairman'),
    ).rejects.toThrow('Неможливо заблокувати період 2026-03: не виконано умови чеклисту');
  });

  it('setStatus to locked succeeds when closeChecklist passes', async () => {
    prisma.building.findUnique.mockResolvedValue({ id: 'b1', settings: {} });
    prisma.accountingPeriod.findUnique.mockResolvedValue({
      id: 'ap-1',
      buildingId: 'b1',
      period: '2026-03',
      status: AccountingPeriodStatus.open,
    });
    prisma.accountingPeriod.update.mockResolvedValue({
      id: 'ap-1',
      status: AccountingPeriodStatus.locked,
    });
    jest.spyOn(service, 'closeChecklist').mockResolvedValue({
      buildingId: 'b1',
      period: '2026-03',
      status: 'open',
      canSoftClose: true,
      canLock: true,
      strictBankRec: false,
      journalSot: false,
      checks: [{ id: 'pending_expenses', ok: true, label: 'All good', detail: 0 }],
      blocking: [],
    } as any);

    const res = await service.setStatus('b1', '2026-03', AccountingPeriodStatus.locked, 'u1', 'chairman');
    expect(res.status).toBe(AccountingPeriodStatus.locked);
    expect(service.closeChecklist).toHaveBeenCalledWith('b1', '2026-03');
  });
});
