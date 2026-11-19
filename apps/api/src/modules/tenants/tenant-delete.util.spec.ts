import {
  buildTenantDeleteBlockers,
  canDeleteTenant,
  type TenantDeleteSummary,
} from './tenant-delete.util';

const emptySummary = (): TenantDeleteSummary => ({
  buildings: 1,
  apartments: 10,
  users: 1,
  memberships: 1,
  payments: 0,
  accrualLines: 0,
  accruals: 0,
  expenses: 0,
  journalEntries: 0,
  bankStatements: 0,
  supplierInvoices: 0,
  supplierPayments: 0,
  debtWriteOffs: 0,
  bankReconciliations: 0,
  fundTransfers: 0,
  onlinePaymentOrders: 0,
});

describe('buildTenantDeleteBlockers', () => {
  it('blocks active tenant even when finance is empty', () => {
    const blockers = buildTenantDeleteBlockers(emptySummary(), { isActive: true });
    expect(canDeleteTenant(blockers)).toBe(false);
    expect(blockers.some((b) => b.code === 'active')).toBe(true);
  });

  it('allows inactive empty-finance tenant', () => {
    const blockers = buildTenantDeleteBlockers(emptySummary(), { isActive: false });
    expect(canDeleteTenant(blockers)).toBe(true);
  });

  it('blocks when payments exist', () => {
    const s = emptySummary();
    s.payments = 3;
    const blockers = buildTenantDeleteBlockers(s, { isActive: false });
    expect(canDeleteTenant(blockers)).toBe(false);
    expect(blockers.find((b) => b.code === 'payments')?.count).toBe(3);
  });
});
