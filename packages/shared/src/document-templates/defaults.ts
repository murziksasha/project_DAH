import type {
  DocLayoutBlock,
  DocTemplate,
  DocumentTemplatesConfig,
  ExportProfile,
  ExportProfileKind,
} from './types';
import { defaultExportProfiles, normalizeExportProfile } from './export-fields';
import { withGeneratedDocContent } from './layout';

const receiptLayoutBlocks: DocLayoutBlock[] = [
  {
    id: 'receipt-title',
    type: 'heading',
    level: 1,
    text: 'Квитанція на оплату',
    align: 'center',
    weight: 'bold',
  },
  {
    id: 'receipt-org',
    type: 'paragraph',
    level: 3,
    text: '{{buildingName}}\n{{buildingAddress}}',
    align: 'center',
  },
  { id: 'receipt-spacer-1', type: 'spacer', size: 'medium' },
  {
    id: 'receipt-details',
    type: 'fieldGrid',
    columns: 2,
    fields: [
      { label: 'Квартира', value: '{{apartmentNumber}}' },
      { label: 'Період', value: '{{period}}' },
      { label: 'Послуга', value: '{{title}}' },
      { label: 'Фонд', value: '{{fundName}}' },
      { label: '№ рахунку', value: '{{receiptNumber}}' },
      { label: 'Власник', value: '{{ownerName}}' },
      { label: 'Нараховано', value: '{{amount}}' },
      { label: 'Сплачено', value: '{{paidAmount}}' },
      { label: 'До сплати', value: '{{balance}}' },
      { label: 'Термін оплати', value: '{{dueDate}}' },
    ],
  },
  { id: 'receipt-spacer-2', type: 'spacer', size: 'small' },
  {
    id: 'receipt-bank',
    type: 'paragraph',
    level: 3,
    text: 'Реквізити: {{bankName}}\nIBAN: {{bankIban}}\nПризначення: {{paymentNote}}',
    align: 'left',
  },
  {
    id: 'receipt-footer',
    type: 'paragraph',
    level: 3,
    text: 'Сформовано: {{createdAt}} · {{appName}}',
    align: 'center',
  },
  {
    id: 'receipt-sign',
    type: 'signatures',
    left: 'Бухгалтер: __________________',
    right: 'Мешканець: __________________',
  },
];

const boardReportLayoutBlocks: DocLayoutBlock[] = [
  {
    id: 'board-title',
    type: 'heading',
    level: 1,
    text: 'Фінансовий звіт для зборів / правління',
    align: 'center',
    weight: 'bold',
  },
  {
    id: 'board-org',
    type: 'paragraph',
    level: 3,
    text: '{{buildingName}}\n{{buildingAddress}}',
    align: 'center',
  },
  {
    id: 'board-period',
    type: 'paragraph',
    level: 3,
    text: 'Період: {{periodLabel}}\nСформовано: {{generatedAt}}',
    align: 'left',
  },
  { id: 'board-cash-h', type: 'heading', level: 2, text: 'Рух коштів', weight: 'bold' },
  {
    id: 'board-cash',
    type: 'fieldRow',
    fields: [
      { label: 'Надходження', value: '{{totalIncome}}' },
      { label: 'Витрати', value: '{{totalExpenses}}' },
      { label: 'Чистий рух', value: '{{netFlow}}' },
    ],
  },
  {
    id: 'board-funds',
    type: 'dataTable',
    kind: 'fund_balances',
    title: 'Баланс фондів',
  },
  {
    id: 'board-exp',
    type: 'dataTable',
    kind: 'expenses_by_category',
    title: 'Витрати за категоріями',
  },
  {
    id: 'board-debt',
    type: 'dataTable',
    kind: 'debtors',
    title: 'Боржники',
  },
  {
    id: 'board-footer',
    type: 'paragraph',
    level: 3,
    text: '{{appName}} · self-hosted звіт',
    align: 'center',
  },
];

export const defaultDocLayouts: Record<string, DocLayoutBlock[]> = {
  receipt: receiptLayoutBlocks,
  board_report: boardReportLayoutBlocks,
};

export const defaultDocTemplates: DocTemplate[] = [
  withGeneratedDocContent({
    id: 'receipt',
    title: 'Квитанція',
    kind: 'receipt',
    layoutVersion: 1,
    layoutBlocks: receiptLayoutBlocks,
    pageSize: 'A4',
    orientation: 'portrait',
    isActive: true,
    sortOrder: 10,
  }),
  withGeneratedDocContent({
    id: 'board_report',
    title: 'Звіт для правління / зборів',
    kind: 'board_report',
    layoutVersion: 1,
    layoutBlocks: boardReportLayoutBlocks,
    pageSize: 'A4',
    orientation: 'portrait',
    isActive: true,
    sortOrder: 20,
  }),
];

export function getDefaultDocLayoutBlocks(kind: string): DocLayoutBlock[] {
  const blocks = defaultDocLayouts[kind];
  if (blocks) return blocks.map((b) => JSON.parse(JSON.stringify(b)) as DocLayoutBlock);
  return [
    createHeadingFallback(),
    {
      id: 'fallback-grid',
      type: 'fieldGrid',
      columns: 2,
      fields: [
        { label: 'Поле', value: '{{buildingName}}' },
      ],
    },
  ];
}

function createHeadingFallback(): DocLayoutBlock {
  return {
    id: 'fallback-heading',
    type: 'heading',
    level: 1,
    text: 'Документ',
    align: 'center',
    weight: 'bold',
  };
}

export function createDocTemplate(partial?: Partial<DocTemplate>): DocTemplate {
  const kind = partial?.kind ?? 'custom';
  const id = partial?.id ?? `form-${Date.now()}`;
  const layoutBlocks =
    partial?.layoutBlocks?.length
      ? partial.layoutBlocks
      : getDefaultDocLayoutBlocks(kind === 'custom' ? 'receipt' : kind);
  return withGeneratedDocContent({
    id,
    title: partial?.title ?? 'Новий шаблон',
    kind,
    layoutVersion: 1,
    layoutBlocks,
    pageSize: 'A4',
    orientation: partial?.orientation ?? 'portrait',
    isActive: partial?.isActive !== false,
    sortOrder: partial?.sortOrder ?? 100,
  });
}

export function normalizeDocTemplate(form: DocTemplate): DocTemplate {
  const kind = form.kind ?? 'custom';
  const layoutBlocks =
    Array.isArray(form.layoutBlocks) && form.layoutBlocks.length > 0
      ? form.layoutBlocks
      : getDefaultDocLayoutBlocks(kind === 'custom' ? 'receipt' : kind);
  return withGeneratedDocContent({
    ...form,
    kind,
    layoutVersion: 1,
    layoutBlocks,
    pageSize: 'A4',
    orientation: form.orientation === 'landscape' ? 'landscape' : 'portrait',
    isActive: form.isActive !== false,
    sortOrder: Number.isFinite(form.sortOrder) ? form.sortOrder : 100,
  });
}

export function normalizeDocumentTemplatesConfig(
  raw: unknown,
): DocumentTemplatesConfig {
  const src =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Partial<DocumentTemplatesConfig>)
      : {};

  const sourceForms = Array.isArray(src.forms) && src.forms.length > 0 ? src.forms : defaultDocTemplates;
  const forms = sourceForms.map((f) => normalizeDocTemplate(f as DocTemplate));

  // Ensure built-in kinds exist
  const existingIds = new Set(forms.map((f) => f.id));
  for (const def of defaultDocTemplates) {
    if (!existingIds.has(def.id)) {
      forms.push(normalizeDocTemplate(def));
    }
  }
  forms.sort((a, b) => a.sortOrder - b.sortOrder);

  const sourceExports =
    Array.isArray(src.exports) && src.exports.length > 0
      ? src.exports
      : defaultExportProfiles;
  const exportProfiles = sourceExports.map((e) =>
    normalizeExportProfile(e as ExportProfile),
  );
  const exportIds = new Set(exportProfiles.map((e) => e.id));
  for (const def of defaultExportProfiles) {
    if (!exportIds.has(def.id)) {
      exportProfiles.push(normalizeExportProfile(def));
    }
  }
  exportProfiles.sort((a, b) => a.sortOrder - b.sortOrder);

  return { forms, exports: exportProfiles };
}

export function getActiveDocTemplate(
  config: DocumentTemplatesConfig,
  kind: DocTemplate['kind'],
): DocTemplate {
  const active = config.forms.find((f) => f.kind === kind && f.isActive);
  if (active) return active;
  const any = config.forms.find((f) => f.kind === kind);
  if (any) return any;
  return (
    defaultDocTemplates.find((f) => f.kind === kind) ??
    defaultDocTemplates[0]
  );
}

export function getExportProfile(
  config: DocumentTemplatesConfig,
  kind: ExportProfileKind,
) {
  return (
    config.exports.find((e) => e.kind === kind && e.isActive) ??
    config.exports.find((e) => e.kind === kind) ??
    defaultExportProfiles.find((e) => e.kind === kind)
  );
}

/** Sample data for live preview in the constructor UI. */
export const sampleReceiptData: Record<string, string> = {
  buildingName: 'ОСББ «Сонячний»',
  buildingAddress: 'м. Київ, вул. Прикладна, 1',
  edrpou: '12345678',
  bankName: 'ПриватБанк',
  bankIban: 'UA00 0000 0000 0000 0000 0000 000',
  paymentNote: 'Кв. 12, утримання, 2026-07',
  apartmentNumber: '12',
  entrance: '1',
  area: '54.2',
  ownerName: 'Іваненко І.І.',
  ownerPhone: '+380501112233',
  period: '2026-07',
  title: 'Утримання будинку',
  fundName: 'Фонд утримання',
  receiptNumber: 'A1B2C3D4',
  lineId: 'line-demo-001',
  dueDate: '14.08.2026',
  createdAt: '02.08.2026',
  amount: '450,00 грн',
  paidAmount: '0,00 грн',
  balance: '450,00 грн',
  currency: 'UAH',
  appName: 'Мій дім',
  footerNote: '',
};

export const sampleBoardReportData: Record<string, string> = {
  buildingName: 'ОСББ «Сонячний»',
  buildingAddress: 'м. Київ, вул. Прикладна, 1',
  edrpou: '12345678',
  periodFrom: '2026-01-01',
  periodTo: '2026-07-31',
  periodLabel: '2026-01-01 — 2026-07-31',
  generatedAt: '02.08.2026, 12:00',
  totalIncome: '120 000,00 грн',
  totalExpenses: '95 000,00 грн',
  netFlow: '25 000,00 грн',
  totalDebt: '8 500,00 грн',
  debtorsCount: '3',
  appName: 'Мій дім',
  footerNote: '',
};

export const sampleBoardTableHtml = {
  fund_balances: `<table class="doc-line-table cols-4"><thead><tr><th>Фонд</th><th>Баланс</th><th>Надх.</th><th>Витр.</th></tr></thead><tbody>
<tr><td>Утримання</td><td>40 000,00 грн</td><td>80 000,00 грн</td><td>60 000,00 грн</td></tr>
<tr><td>Капремонт</td><td>15 000,00 грн</td><td>40 000,00 грн</td><td>35 000,00 грн</td></tr>
</tbody></table>`,
  expenses_by_category: `<table class="doc-line-table cols-2"><thead><tr><th>Категорія</th><th>Сума</th></tr></thead><tbody>
<tr><td>Електроенергія</td><td>22 000,00 грн</td></tr>
<tr><td>Прибирання</td><td>18 000,00 грн</td></tr>
</tbody></table>`,
  debtors: `<table class="doc-line-table cols-3"><thead><tr><th>Кв.</th><th>Під'їзд</th><th>Борг</th></tr></thead><tbody>
<tr><td>5</td><td>1</td><td>3 200,00 грн</td></tr>
<tr><td>12</td><td>2</td><td>5 300,00 грн</td></tr>
</tbody></table>`,
  payment_lines: `<table class="doc-line-table cols-2"><thead><tr><th>Послуга</th><th>Сума</th></tr></thead><tbody>
<tr><td>Утримання</td><td>450,00 грн</td></tr>
</tbody></table>`,
};
