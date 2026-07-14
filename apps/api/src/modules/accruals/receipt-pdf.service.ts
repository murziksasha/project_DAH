import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

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
}

@Injectable()
export class ReceiptPdfService {
  generate(data: ReceiptData): Promise<Buffer> {
    return this.generateMany([data]);
  }

  /** One A4 page per receipt. */
  generateMany(pages: ReceiptData[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      pages.forEach((data, index) => {
        if (index > 0) doc.addPage();
        this.drawReceipt(doc, data);
      });

      doc.end();
    });
  }

  private drawReceipt(doc: PDFKit.PDFDocument, data: ReceiptData) {
    doc.fontSize(18).fillColor('#000').text('Квитанція на оплату', { align: 'center' });
    doc.moveDown(0.5);
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

    const fmt = (n: number) => `${n.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} грн`;

    doc.fontSize(14).text(`До сплати: ${fmt(data.amount)}`, { underline: true });
    doc.fontSize(12).moveDown(0.5);
    doc.text(`Сплачено: ${fmt(data.paidAmount)}`);
    doc.text(`Залишок: ${fmt(data.balance)}`);
    if (data.dueDate) {
      doc.text(`Термін оплати: ${new Date(data.dueDate).toLocaleDateString('uk-UA')}`);
    }

    doc.moveDown(2);
    doc.fontSize(9).fillColor('#888');
    doc.text(
      `Сформовано: ${data.createdAt.toLocaleDateString('uk-UA')} · DAH OSMD`,
      { align: 'center' },
    );
  }
}