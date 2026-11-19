export type TenantDeleteBlocker = {
  code: string;
  label: string;
  count: number;
};

export type TenantDeleteSummary = {
  buildings: number;
  apartments: number;
  users: number;
  memberships: number;
  payments: number;
  accrualLines: number;
  accruals: number;
  expenses: number;
  journalEntries: number;
  bankStatements: number;
  supplierInvoices: number;
  supplierPayments: number;
  debtWriteOffs: number;
  bankReconciliations: number;
  fundTransfers: number;
  onlinePaymentOrders: number;
};

const BLOCKER_LABELS: Record<string, string> = {
  payments: 'Платежі мешканців',
  accrualLines: 'Рядки нарахувань',
  accruals: 'Нарахування',
  expenses: 'Витрати',
  journalEntries: 'Проводки журналу',
  bankStatements: 'Банківські виписки',
  supplierInvoices: 'Рахунки постачальників',
  supplierPayments: 'Оплати постачальникам',
  debtWriteOffs: 'Списання боргів',
  bankReconciliations: 'Банківські звірки',
  fundTransfers: 'Перекази між фондами',
  onlinePaymentOrders: 'Онлайн-платежі',
};

/** Finance-related counters that block hard delete when > 0. */
export const TENANT_DELETE_FINANCE_KEYS = [
  'payments',
  'accrualLines',
  'accruals',
  'expenses',
  'journalEntries',
  'bankStatements',
  'supplierInvoices',
  'supplierPayments',
  'debtWriteOffs',
  'bankReconciliations',
  'fundTransfers',
  'onlinePaymentOrders',
] as const;

export function buildTenantDeleteBlockers(
  summary: TenantDeleteSummary,
  opts: { isActive: boolean },
): TenantDeleteBlocker[] {
  const blockers: TenantDeleteBlocker[] = [];
  if (opts.isActive) {
    blockers.push({
      code: 'active',
      label: 'Спочатку вимкніть організацію',
      count: 1,
    });
  }
  for (const key of TENANT_DELETE_FINANCE_KEYS) {
    const count = summary[key];
    if (count > 0) {
      blockers.push({
        code: key,
        label: BLOCKER_LABELS[key] ?? key,
        count,
      });
    }
  }
  return blockers;
}

export function canDeleteTenant(blockers: TenantDeleteBlocker[]): boolean {
  return blockers.length === 0;
}
