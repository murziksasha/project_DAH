import type {
  DocDataTableKind,
  DocLayoutBlock,
  DocLayoutField,
  DocTemplate,
  DocTemplateData,
} from '@dah/shared';
import { applyDocTemplateData as applyShared } from '@dah/shared';
import { usePdfFont } from './pdf-font';

export type DocTableRows = Partial<Record<DocDataTableKind, string[][]>>;

/** Apply {{tokens}} without HTML escaping (for PDF plain text). */
export function applyDocTokens(text: string, data: DocTemplateData): string {
  return text.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key: string) => {
    const value = data[key];
    return value !== undefined && value !== null ? String(value) : '';
  });
}

function spacerHeight(size: 'small' | 'medium' | 'large'): number {
  if (size === 'small') return 8;
  if (size === 'large') return 28;
  return 16;
}

function fontSizeForLevel(level: 1 | 2 | 3, base: 'heading' | 'paragraph'): number {
  if (base === 'heading') {
    if (level === 1) return 16;
    if (level === 2) return 13;
    return 11;
  }
  if (level === 1) return 12;
  if (level === 2) return 11;
  return 10;
}

function drawFields(
  doc: PDFKit.PDFDocument,
  fields: DocLayoutField[],
  columns: number,
  data: DocTemplateData,
) {
  const safeCols = Math.max(1, Math.min(columns, 4));
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colWidth = pageWidth / safeCols;

  for (let i = 0; i < fields.length; i += safeCols) {
    const row = fields.slice(i, i + safeCols);
    const startY = doc.y;
    let maxH = 0;
    row.forEach((field, idx) => {
      const x = doc.page.margins.left + idx * colWidth;
      const label = applyDocTokens(field.label, data);
      const value = applyDocTokens(field.value, data);
      const text = label ? `${label}: ${value}` : value;
      usePdfFont(doc, 'Regular');
      doc.fontSize(10).fillColor('#000');
      const h = doc.heightOfString(text, { width: colWidth - 8 });
      doc.text(text, x, startY, { width: colWidth - 8, continued: false });
      if (h > maxH) maxH = h;
    });
    doc.x = doc.page.margins.left;
    doc.y = startY + maxH + 4;
  }
}

function drawTable(doc: PDFKit.PDFDocument, rows: string[][]) {
  if (!rows.length) {
    usePdfFont(doc, 'Regular');
    doc.fontSize(10).fillColor('#666').text('—');
    return;
  }
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colCount = Math.max(...rows.map((r) => r.length), 1);
  const colWidth = pageWidth / colCount;

  rows.forEach((row, rowIndex) => {
    if (doc.y > doc.page.height - doc.page.margins.bottom - 40) {
      doc.addPage();
    }
    const y = doc.y;
    let maxH = 12;
    // Pad short rows so column count stays stable (headers vs data)
    const cells = Array.from({ length: colCount }, (_, i) => row[i] ?? '');
    cells.forEach((cell, colIndex) => {
      const x = doc.page.margins.left + colIndex * colWidth;
      if (rowIndex === 0) usePdfFont(doc, 'Bold');
      else usePdfFont(doc, 'Regular');
      doc.fontSize(9).fillColor('#000');
      const align = colIndex === 0 ? 'left' : 'right';
      const h = doc.heightOfString(cell, { width: colWidth - 6, align });
      doc.text(cell, x, y, { width: colWidth - 6, align });
      if (h > maxH) maxH = h;
    });
    doc.x = doc.page.margins.left;
    doc.y = y + maxH + 3;
  });
  doc.moveDown(0.3);
}

function drawBlock(
  doc: PDFKit.PDFDocument,
  block: DocLayoutBlock,
  data: DocTemplateData,
  tables: DocTableRows,
) {
  switch (block.type) {
    case 'heading': {
      const text = applyDocTokens(block.text, data);
      const size = fontSizeForLevel(block.level, 'heading');
      usePdfFont(doc, block.weight === 'light' ? 'Regular' : 'Bold');
      doc.fontSize(size).fillColor('#000').text(text, {
        align: block.align ?? 'left',
      });
      doc.moveDown(0.3);
      break;
    }
    case 'paragraph': {
      const text = applyDocTokens(block.text, data);
      const size = fontSizeForLevel(block.level, 'paragraph');
      usePdfFont(doc, block.weight === 'bold' ? 'Bold' : 'Regular');
      doc.fontSize(size).fillColor('#000').text(text, {
        align: block.align ?? 'left',
      });
      doc.moveDown(0.35);
      break;
    }
    case 'fieldRow':
      drawFields(doc, block.fields, 1, data);
      doc.moveDown(0.2);
      break;
    case 'fieldGrid':
      drawFields(doc, block.fields, block.columns ?? 2, data);
      doc.moveDown(0.2);
      break;
    case 'customTable': {
      const cols = block.columns?.length
        ? block.columns
        : [{ id: 'name', label: 'Назва' }];
      const header = cols.map((c) => applyDocTokens(c.label, data));
      const body = (block.rows ?? []).map((row) =>
        cols.map((c) => applyDocTokens(row.cells[c.id] ?? '', data)),
      );
      drawTable(doc, [header, ...body]);
      break;
    }
    case 'dataTable': {
      if (block.title) {
        usePdfFont(doc, 'Bold');
        doc.fontSize(12).fillColor('#000').text(applyDocTokens(block.title, data), {
          underline: true,
        });
        doc.moveDown(0.35);
      }
      const rows = tables[block.kind] ?? [];
      if (!rows.length) {
        usePdfFont(doc, 'Regular');
        doc.fontSize(10).fillColor('#666').text('Немає даних');
        doc.moveDown(0.4);
      } else {
        drawTable(doc, rows);
      }
      break;
    }
    case 'signatures': {
      const left = applyDocTokens(block.left, data);
      const right = applyDocTokens(block.right, data);
      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const y = doc.y + 8;
      usePdfFont(doc, 'Regular');
      doc.fontSize(10).fillColor('#000');
      doc.text(left, doc.page.margins.left, y, { width: pageWidth / 2 - 8 });
      doc.text(right, doc.page.margins.left + pageWidth / 2, y, {
        width: pageWidth / 2 - 8,
      });
      doc.x = doc.page.margins.left;
      doc.y = y + 24;
      break;
    }
    case 'divider': {
      const y = doc.y + 4;
      doc
        .moveTo(doc.page.margins.left, y)
        .lineTo(doc.page.width - doc.page.margins.right, y)
        .strokeColor('#ccc')
        .stroke();
      doc.y = y + 10;
      break;
    }
    case 'spacer':
      doc.y += spacerHeight(block.size);
      break;
    case 'columns': {
      // Simplified: render columns sequentially (full width each) for reliable PDFKit layout
      for (const col of block.columns) {
        for (const child of col.blocks) {
          drawBlock(doc, child, data, tables);
        }
      }
      break;
    }
    default:
      break;
  }
}

/**
 * Draw a document template onto an open PDFKit document (current page).
 */
export function drawDocTemplate(
  doc: PDFKit.PDFDocument,
  template: DocTemplate,
  data: DocTemplateData,
  tables: DocTableRows = {},
) {
  const blocks = template.layoutBlocks ?? [];
  for (const block of blocks) {
    if (doc.y > doc.page.height - doc.page.margins.bottom - 36) {
      doc.addPage();
    }
    drawBlock(doc, block, data, tables);
  }
}

/** Re-export shared apply with HTML escape for HTML previews only. */
export { applyShared as applyDocTemplateDataHtml };
