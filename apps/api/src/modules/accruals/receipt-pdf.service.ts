import { Injectable } from '@nestjs/common';
import {
  getActiveDocTemplate,
  normalizeDocumentTemplatesConfig,
  type DocTemplate,
  type DocTemplateData,
  type DocumentTemplatesConfig,
} from '@dah/shared';
import PDFDocument from 'pdfkit';
import { drawDocTemplate } from '../../common/utils/document-template-pdf';
import { registerPdfFonts, usePdfFont } from '../../common/utils/pdf-font';

export interface ReceiptData {
  buildingName: string;
  buildingAddress: string;
  apartmentNumber: string;
  period: string;
  title: string;
  fundName: string;
  amount: number;
  paidAmount: number;
  balance: number;
  dueDate: string | null;
  lineId: string;
  createdAt: Date;
  /** Optional enrichment from constructor variables */
  edrpou?: string | null;
  entrance?: number | string | null;
  area?: number | string | null;
  ownerName?: string | null;
  ownerPhone?: string | null;
  bankName?: string | null;
  bankIban?: string | null;
  paymentNote?: string | null;
  /** Pre-resolved template; if omitted, built-in default is used. */
  template?: DocTemplate;
}

function moneyUa(n: number) {
  return `${n.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} грн`;
}

function dateUa(value: string | Date | null | undefined) {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('uk-UA');
}

export function receiptDataToTemplateVars(data: ReceiptData): DocTemplateData {
  return {
    buildingName: data.buildingName,
    buildingAddress: data.buildingAddress,
    edrpou: data.edrpou ?? '',
    bankName: data.bankName ?? '',
    bankIban: data.bankIban ?? '',
    paymentNote:
      data.paymentNote ??
      `Кв. ${data.apartmentNumber}, ${data.title}, ${data.period}`,
    apartmentNumber: data.apartmentNumber,
    entrance: data.entrance != null ? String(data.entrance) : '',
    area: data.area != null ? String(data.area) : '',
    ownerName: data.ownerName ?? '',
    ownerPhone: data.ownerPhone ?? '',
    period: data.period,
    title: data.title,
    fundName: data.fundName,
    receiptNumber: data.lineId.slice(-8).toUpperCase(),
    lineId: data.lineId,
    dueDate: dateUa(data.dueDate),
    createdAt: dateUa(data.createdAt),
    amount: moneyUa(data.amount),
    paidAmount: moneyUa(data.paidAmount),
    balance: moneyUa(data.balance),
    currency: 'UAH',
    appName: 'Мій дім',
    footerNote: '',
  };
}

@Injectable()
export class ReceiptPdfService {
  generate(data: ReceiptData): Promise<Buffer> {
    return this.generateMany([data]);
  }

  /** One A4 page per receipt, using document constructor template when provided. */
  generateMany(pages: ReceiptData[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      registerPdfFonts(doc);

      pages.forEach((data, index) => {
        if (index > 0) doc.addPage();
        const template =
          data.template ??
          getActiveDocTemplate(normalizeDocumentTemplatesConfig(null), 'receipt');
        const vars = receiptDataToTemplateVars(data);
        drawDocTemplate(doc, template, vars);
      });

      doc.end();
    });
  }

  /** Legacy hardcoded layout (fallback if templates fail). */
  drawLegacy(doc: PDFKit.PDFDocument, data: ReceiptData) {
    usePdfFont(doc, 'Bold');
    doc.fontSize(18).fillColor('#000').text('Квитанція на оплату', { align: 'center' });
    doc.moveDown(0.5);
    usePdfFont(doc, 'Regular');
    doc.fontSize(11).fillColor('#555').text(data.buildingName, { align: 'center' });
    doc.text(data.buildingAddress, { align: 'center' });
    doc.moveDown(1.5);

    doc.fillColor('#000').fontSize(12);
    doc.text(`Квартира: ${data.apartmentNumber}`);
    doc.text(`Період: ${data.period}`);
    doc.text(`Послуга: ${data.title}`);
    doc.text(`Фонд: ${data.fundName}`);
    doc.text(`№ рахунку: ${data.lineId.slice(-8).toUpperCase()}`);
    doc.moveDown(1);

    usePdfFont(doc, 'Bold');
    doc.fontSize(14).text(`До сплати: ${moneyUa(data.amount)}`, { underline: true });
    usePdfFont(doc, 'Regular');
    doc.fontSize(12).moveDown(0.5);
    doc.text(`Сплачено: ${moneyUa(data.paidAmount)}`);
    doc.text(`Залишок: ${moneyUa(data.balance)}`);
    if (data.dueDate) {
      doc.text(`Термін оплати: ${dateUa(data.dueDate)}`);
    }

    doc.moveDown(2);
    doc.fontSize(9).fillColor('#888');
    doc.text(
      `Сформовано: ${dateUa(data.createdAt)} · Мій дім`,
      { align: 'center' },
    );
  }
}

export function resolveReceiptTemplate(
  config: DocumentTemplatesConfig | unknown,
): DocTemplate {
  return getActiveDocTemplate(normalizeDocumentTemplatesConfig(config), 'receipt');
}
