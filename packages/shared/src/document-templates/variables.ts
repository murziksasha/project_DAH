import type { DocTemplateKind } from './types';

export type DocVariableKey = string;

export type DocVariableGroup = {
  title: string;
  /** Kind filter: if set, group is primarily for this document kind. */
  kinds?: DocTemplateKind[];
  variables: Array<{ key: DocVariableKey; label: string }>;
};

/**
 * Template placeholders: `{{key}}`.
 * Domain adapted from service-CRM print forms to housing receipts / board reports.
 */
export const docVariableGroups: DocVariableGroup[] = [
  {
    title: 'Організація',
    variables: [
      { key: 'buildingName', label: 'Назва будинку / організації' },
      { key: 'buildingAddress', label: 'Адреса' },
      { key: 'edrpou', label: 'ЄДРПОУ' },
      { key: 'bankName', label: 'Банк' },
      { key: 'bankIban', label: 'IBAN' },
      { key: 'paymentNote', label: 'Призначення платежу' },
    ],
  },
  {
    title: 'Квартира / мешканець',
    kinds: ['receipt', 'custom'],
    variables: [
      { key: 'apartmentNumber', label: 'Номер квартири' },
      { key: 'entrance', label: "Під'їзд" },
      { key: 'area', label: 'Площа, м²' },
      { key: 'ownerName', label: 'Власник / мешканець' },
      { key: 'ownerPhone', label: 'Телефон' },
    ],
  },
  {
    title: 'Нарахування',
    kinds: ['receipt', 'custom'],
    variables: [
      { key: 'period', label: 'Період' },
      { key: 'title', label: 'Назва нарахування / послуги' },
      { key: 'fundName', label: 'Фонд' },
      { key: 'receiptNumber', label: '№ квитанції' },
      { key: 'lineId', label: 'ID рядка' },
      { key: 'dueDate', label: 'Термін оплати' },
      { key: 'createdAt', label: 'Дата формування' },
    ],
  },
  {
    title: 'Суми',
    kinds: ['receipt', 'custom'],
    variables: [
      { key: 'amount', label: 'Нараховано' },
      { key: 'paidAmount', label: 'Сплачено' },
      { key: 'balance', label: 'До сплати / залишок' },
      { key: 'currency', label: 'Валюта' },
    ],
  },
  {
    title: 'Звіт (період)',
    kinds: ['board_report', 'custom'],
    variables: [
      { key: 'periodFrom', label: 'Період від' },
      { key: 'periodTo', label: 'Період до' },
      { key: 'periodLabel', label: 'Підпис періоду' },
      { key: 'generatedAt', label: 'Сформовано' },
      { key: 'totalIncome', label: 'Надходження' },
      { key: 'totalExpenses', label: 'Витрати' },
      { key: 'netFlow', label: 'Чистий рух' },
      { key: 'totalDebt', label: 'Дебіторка' },
      { key: 'debtorsCount', label: 'К-сть боржників' },
    ],
  },
  {
    title: 'Службові',
    variables: [
      { key: 'appName', label: 'Назва продукту' },
      { key: 'footerNote', label: 'Підвал / примітка' },
    ],
  },
];

export function variableGroupsForKind(kind: DocTemplateKind): DocVariableGroup[] {
  return docVariableGroups.filter(
    (g) => !g.kinds || g.kinds.includes(kind) || kind === 'custom',
  );
}

export const dataTableKindLabels: Record<string, string> = {
  fund_balances: 'Таблиця: баланси фондів',
  expenses_by_category: 'Таблиця: витрати за категоріями',
  debtors: 'Таблиця: боржники',
  payment_lines: 'Таблиця: рядки нарахування / оплати',
};
