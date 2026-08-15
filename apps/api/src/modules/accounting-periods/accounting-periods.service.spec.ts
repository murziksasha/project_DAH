import { ForbiddenException } from '@nestjs/common';
import { AccountingPeriodStatus } from '@prisma/client';
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
});
