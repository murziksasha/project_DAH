import { existsSync } from 'fs';
import { join } from 'path';

export type PdfFontWeight = 'Regular' | 'Bold';

const FONT_FILES: Record<PdfFontWeight, string> = {
  Regular: 'DejaVuSans.ttf',
  Bold: 'DejaVuSans-Bold.ttf',
};

/** Resolve bundled TTF (dev: apps/api/assets, prod Docker: cwd/assets). */
export function resolvePdfFontPath(weight: PdfFontWeight = 'Regular'): string {
  const file = FONT_FILES[weight];
  const candidates = [
    join(process.cwd(), 'assets', 'fonts', file),
    join(process.cwd(), 'apps', 'api', 'assets', 'fonts', file),
    // compiled: dist/src/common/utils → ../../../assets/fonts
    join(__dirname, '..', '..', '..', 'assets', 'fonts', file),
    // monorepo from repo root when cwd is project root
    join(__dirname, '..', '..', '..', '..', 'assets', 'fonts', file),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(
    `PDF font not found: ${file}. Looked in: ${candidates.join('; ')}`,
  );
}

const registered = new WeakSet<object>();

/** Register Unicode fonts once per document and set Regular as default. */
export function registerPdfFonts(doc: PDFKit.PDFDocument): void {
  if (registered.has(doc as object)) {
    doc.font('Regular');
    return;
  }
  doc.registerFont('Regular', resolvePdfFontPath('Regular'));
  doc.registerFont('Bold', resolvePdfFontPath('Bold'));
  registered.add(doc as object);
  doc.font('Regular');
}

export function usePdfFont(doc: PDFKit.PDFDocument, weight: PdfFontWeight = 'Regular'): void {
  if (!registered.has(doc as object)) {
    registerPdfFonts(doc);
  }
  doc.font(weight);
}
