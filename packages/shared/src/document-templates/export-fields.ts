import type { ExportFieldDef, ExportProfile, ExportProfileKind } from './types';

const field = (key: string, label: string, enabled = true): ExportFieldDef => ({
  key,
  label,
  enabled,
});

export const defaultExportFields: Record<ExportProfileKind, ExportFieldDef[]> = {
  debtors: [
    field('number', 'Квартира'),
    field('entrance', "Під'їзд"),
    field('debt', 'Борг'),
    field('lines', 'Рядків'),
    field('oldestDue', 'Найстаріший термін'),
    field('isOverdue', 'Статус'),
  ],
  cash_flow: [
    field('metric', 'Показник'),
    field('amount', 'Сума'),
    field('fundName', 'Фонд'),
    field('fundBalance', 'Баланс фонду'),
    field('fundIncome', 'Надходження фонду'),
    field('fundExpenses', 'Витрати фонду'),
  ],
  expenses: [
    field('date', 'Дата'),
    field('category', 'Категорія'),
    field('fund', 'Фонд'),
    field('supplier', 'Постачальник'),
    field('amount', 'Сума'),
    field('description', 'Опис'),
  ],
  statement: [
    field('date', 'Дата'),
    field('type', 'Тип'),
    field('title', 'Опис'),
    field('debit', 'Дебет'),
    field('credit', 'Кредит'),
    field('balance', 'Залишок'),
    field('period', 'Період'),
  ],
  export_pack: [
    field('includeDebtors', 'Боржники', true),
    field('includeCashFlow', 'Рух коштів', true),
    field('includeExpenses', 'Витрати', true),
    field('includePayments', 'Платежі', true),
  ],
};

export const defaultExportProfiles: ExportProfile[] = [
  {
    id: 'export-debtors',
    title: 'Excel: боржники',
    kind: 'debtors',
    fields: defaultExportFields.debtors.map((f) => ({ ...f })),
    isActive: true,
    sortOrder: 10,
  },
  {
    id: 'export-cash-flow',
    title: 'Excel: рух коштів',
    kind: 'cash_flow',
    fields: defaultExportFields.cash_flow.map((f) => ({ ...f })),
    isActive: true,
    sortOrder: 20,
  },
  {
    id: 'export-expenses',
    title: 'Excel: витрати',
    kind: 'expenses',
    fields: defaultExportFields.expenses.map((f) => ({ ...f })),
    isActive: true,
    sortOrder: 30,
  },
  {
    id: 'export-statement',
    title: 'Excel: виписка квартири',
    kind: 'statement',
    fields: defaultExportFields.statement.map((f) => ({ ...f })),
    isActive: true,
    sortOrder: 40,
  },
  {
    id: 'export-pack',
    title: 'Пакет експорту (ZIP)',
    kind: 'export_pack',
    fields: defaultExportFields.export_pack.map((f) => ({ ...f })),
    isActive: true,
    sortOrder: 50,
  },
];

export function normalizeExportProfile(profile: ExportProfile): ExportProfile {
  const catalog = defaultExportFields[profile.kind] ?? [];
  const byKey = new Map(profile.fields.map((f) => [f.key, f]));
  const fields = catalog.map((def) => {
    const existing = byKey.get(def.key);
    return existing
      ? { key: def.key, label: existing.label || def.label, enabled: existing.enabled !== false }
      : { ...def };
  });
  // Keep custom extra fields if any
  for (const f of profile.fields) {
    if (!fields.some((x) => x.key === f.key)) {
      fields.push({ key: f.key, label: f.label, enabled: f.enabled !== false });
    }
  }
  return {
    ...profile,
    fields,
    isActive: profile.isActive !== false,
    sortOrder: Number.isFinite(profile.sortOrder) ? profile.sortOrder : 100,
  };
}

export function enabledExportFieldKeys(profile: ExportProfile | undefined): string[] {
  if (!profile) return [];
  return profile.fields.filter((f) => f.enabled).map((f) => f.key);
}
