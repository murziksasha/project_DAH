/** Excel-friendly CSV (UTF-8 BOM added by caller if needed). */
export function csvEscape(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[";\n\r]/.test(s) || s.includes(',')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(
  rows: Array<Array<string | number | boolean | null | undefined>>,
  sep = ';',
): string {
  return rows.map((row) => row.map(csvEscape).join(sep)).join('\r\n');
}

export function bomCsv(content: string): Buffer {
  return Buffer.from('\uFEFF' + content, 'utf8');
}
