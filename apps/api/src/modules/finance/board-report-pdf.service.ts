import { Injectable } from '@nestjs/common';
import {
  getActiveDocTemplate,
  normalizeDocumentTemplatesConfig,
  type DocTemplate,
  type DocTemplateData,
  type DocumentTemplatesConfig,
} from '@dah/shared';
import PDFDocument from 'pdfkit';
import {
  drawDocTemplate,
  type DocTableRows,
} from '../../common/utils/document-template-pdf';
import { registerPdfFonts } from '../../common/utils/pdf-font';

export interface BoardReportData {
  buildingName: string;
  buildingAddress: string;
  generatedAt: Date;
  period: { from?: string; to?: string };
  cashFlow: {
    totalIncome: number;
    totalExpenses: number;
    netFlow: number;
    fundBalances: Array<{ fundName: string; balance: number; income: number; expenses: number }>;
  };
  expensesSummary: {
    total: number;
    byCategory: Array<{ name: string; total: number }>;
  };
  debtors: Array<{ number: string; entrance: number; debt: number; isOverdue: boolean }>;
  template?: DocTemplate;
}

function moneyUa(n: number) {
  return `${n.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} грн`;
}

export function boardReportToTemplateVars(data: BoardReportData): DocTemplateData {
  const periodLabel =
    data.period.from || data.period.to
      ? `${data.period.from ?? '…'} — ${data.period.to ?? '…'}`
      : 'Весь період';
  const totalDebt = data.debtors.reduce((s, d) => s + d.debt, 0);
  return {
    buildingName: data.buildingName,
    buildingAddress: data.buildingAddress,
    periodFrom: data.period.from ?? '',
    periodTo: data.period.to ?? '',
    periodLabel,
    generatedAt: data.generatedAt.toLocaleString('uk-UA'),
    totalIncome: moneyUa(data.cashFlow.totalIncome),
    totalExpenses: moneyUa(data.cashFlow.totalExpenses),
    netFlow: moneyUa(data.cashFlow.netFlow),
    totalDebt: moneyUa(totalDebt),
    debtorsCount: String(data.debtors.length),
    appName: 'Мій дім',
    footerNote: '',
  };
}

export function boardReportToTables(data: BoardReportData): DocTableRows {
  return {
    fund_balances: [
      ['Фонд', 'Баланс', 'Надходження', 'Витрати'],
      ...data.cashFlow.fundBalances.map((f) => [
        f.fundName,
        moneyUa(f.balance),
        moneyUa(f.income),
        moneyUa(f.expenses),
      ]),
    ],
    expenses_by_category: [
      ['Категорія', 'Сума'],
      ...data.expensesSummary.byCategory.slice(0, 40).map((c) => [c.name, moneyUa(c.total)]),
      ['Разом', moneyUa(data.expensesSummary.total)],
    ],
    debtors: [
      ['Кв.', "Під'їзд", 'Борг', 'Статус'],
      ...data.debtors.slice(0, 60).map((d) => [
        d.number,
        String(d.entrance),
        moneyUa(d.debt),
        d.isOverdue ? 'Прострочено' : 'До сплати',
      ]),
    ],
  };
}

@Injectable()
export class BoardReportPdfService {
  generate(data: BoardReportData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 48, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      registerPdfFonts(doc);

      const template =
        data.template ??
        getActiveDocTemplate(normalizeDocumentTemplatesConfig(null), 'board_report');
      const vars = boardReportToTemplateVars(data);
      const tables = boardReportToTables(data);
      drawDocTemplate(doc, template, vars, tables);

      doc.end();
    });
  }
}

export function resolveBoardReportTemplate(
  config: DocumentTemplatesConfig | unknown,
): DocTemplate {
  return getActiveDocTemplate(normalizeDocumentTemplatesConfig(config), 'board_report');
}
