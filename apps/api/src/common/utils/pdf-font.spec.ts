import { resolvePdfFontPath } from './pdf-font';
import { BoardReportPdfService } from '../../modules/finance/board-report-pdf.service';
import { ReceiptPdfService } from '../../modules/accruals/receipt-pdf.service';

describe('pdf-font', () => {
  it('resolves DejaVu Sans TTF files', () => {
    expect(resolvePdfFontPath('Regular')).toMatch(/DejaVuSans\.ttf$/);
    expect(resolvePdfFontPath('Bold')).toMatch(/DejaVuSans-Bold\.ttf$/);
  });
});

describe('BoardReportPdfService', () => {
  it('embeds Cyrillic text without throwing', async () => {
    const svc = new BoardReportPdfService();
    const buffer = await svc.generate({
      buildingName: 'ОСББ Тест',
      buildingAddress: 'вул. Шевченка, 1',
      generatedAt: new Date('2026-08-01T12:00:00Z'),
      period: { from: '2026-08-01', to: '2026-08-01' },
      cashFlow: {
        totalIncome: 100,
        totalExpenses: 50,
        netFlow: 50,
        fundBalances: [{ fundName: 'Основний', balance: 10, income: 5, expenses: 0 }],
      },
      expensesSummary: { total: 50, byCategory: [{ name: 'Прибирання', total: 50 }] },
      debtors: [{ number: '12', entrance: 1, debt: 225.25, isOverdue: true }],
    });
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(buffer.length).toBeGreaterThan(1000);
  });
});

describe('ReceiptPdfService', () => {
  it('embeds Cyrillic text without throwing', async () => {
    const svc = new ReceiptPdfService();
    const buffer = await svc.generate({
      buildingName: 'ОСББ Тест',
      buildingAddress: 'вул. Шевченка, 1',
      apartmentNumber: '5',
      period: '2026-08',
      title: 'Утримання будинку',
      fundName: 'Основний',
      amount: 100,
      paidAmount: 0,
      balance: 100,
      dueDate: '2026-08-15',
      lineId: 'abc12345lineid01',
      createdAt: new Date('2026-08-01'),
    });
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
  });
});
