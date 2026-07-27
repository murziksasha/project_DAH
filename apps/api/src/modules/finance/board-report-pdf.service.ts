import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

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

      const money = (n: number) =>
        `${n.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} грн`;

      doc.fontSize(16).text('Фінансовий звіт для зборів / правління', { align: 'center' });
      doc.moveDown(0.4);
      doc.fontSize(11).fillColor('#444').text(data.buildingName, { align: 'center' });
      doc.text(data.buildingAddress, { align: 'center' });
      doc.moveDown(0.6);
      doc.fillColor('#000').fontSize(10);
      const periodLabel =
        data.period.from || data.period.to
          ? `${data.period.from ?? '…'} — ${data.period.to ?? '…'}`
          : 'Весь період';
      doc.text(`Період: ${periodLabel}`);
      doc.text(`Сформовано: ${data.generatedAt.toLocaleString('uk-UA')}`);
      doc.moveDown(1);

      doc.fontSize(13).text('Рух коштів', { underline: true });
      doc.moveDown(0.4);
      doc.fontSize(11);
      doc.text(`Надходження: ${money(data.cashFlow.totalIncome)}`);
      doc.text(`Витрати: ${money(data.cashFlow.totalExpenses)}`);
      doc.text(`Чистий рух: ${money(data.cashFlow.netFlow)}`);
      doc.moveDown(0.8);

      doc.fontSize(13).text('Баланс фондів', { underline: true });
      doc.moveDown(0.4);
      doc.fontSize(10);
      for (const f of data.cashFlow.fundBalances) {
        doc.text(
          `${f.fundName}: баланс ${money(f.balance)} (надх. ${money(f.income)}, витр. ${money(f.expenses)})`,
        );
      }
      doc.moveDown(0.8);

      doc.fontSize(13).text('Витрати за категоріями', { underline: true });
      doc.moveDown(0.4);
      doc.fontSize(10);
      if (!data.expensesSummary.byCategory.length) {
        doc.text('Немає витрат за період');
      } else {
        for (const c of data.expensesSummary.byCategory.slice(0, 20)) {
          doc.text(`${c.name}: ${money(c.total)}`);
        }
        doc.moveDown(0.3);
        doc.text(`Разом витрат: ${money(data.expensesSummary.total)}`);
      }
      doc.moveDown(0.8);

      doc.fontSize(13).text(`Боржники (${data.debtors.length})`, { underline: true });
      doc.moveDown(0.4);
      doc.fontSize(10);
      if (!data.debtors.length) {
        doc.text('Боржників немає');
      } else {
        for (const d of data.debtors.slice(0, 40)) {
          doc.text(
            `кв. ${d.number} (під'їзд ${d.entrance}): ${money(d.debt)}${d.isOverdue ? ' — прострочено' : ''}`,
          );
        }
        if (data.debtors.length > 40) {
          doc.text(`… та ще ${data.debtors.length - 40}`);
        }
        const totalDebt = data.debtors.reduce((s, d) => s + d.debt, 0);
        doc.moveDown(0.3);
        doc.text(`Загальна дебіторка: ${money(totalDebt)}`);
      }

      doc.moveDown(1.5);
      doc.fontSize(9).fillColor('#888').text('DAH OSMD · self-hosted звіт', { align: 'center' });
      doc.end();
    });
  }
}
