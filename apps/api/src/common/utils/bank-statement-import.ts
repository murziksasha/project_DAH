/**
 * Parse bank statement CSV and match payment purpose to apartment numbers.
 * Supports comma/semicolon delimiters and common UA date formats.
 */

export type ImportRowStatus = 'matched' | 'unmatched' | 'skipped' | 'invalid';

export interface ParsedStatementRow {
  line: number;
  raw: string;
  date: string | null;
  amount: number | null;
  reference: string;
  extractedApartment: string | null;
  status: ImportRowStatus;
  message?: string;
}

export interface MatchedStatementRow extends ParsedStatementRow {
  apartmentId: string | null;
  apartmentNumber: string | null;
}

export interface ApartmentRef {
  id: string;
  number: string;
  entrance?: number;
}

const APARTMENT_PATTERNS = [
  /кв\.?\s*№?\s*([0-9]+[а-яa-z]?)/i,
  /квартир[аеиуы]?\s*№?\s*([0-9]+[а-яa-z]?)/i,
  /apt\.?\s*#?\s*([0-9]+[а-яa-z]?)/i,
  /#\s*([0-9]+[а-яa-z]?)\b/i,
  /\bflat\s*([0-9]+[а-яa-z]?)/i,
];

export function extractApartmentNumber(text: string): string | null {
  if (!text) return null;
  for (const re of APARTMENT_PATTERNS) {
    const m = text.match(re);
    if (m?.[1]) return normalizeAptNumber(m[1]);
  }
  return null;
}

export function normalizeAptNumber(value: string): string {
  return value.trim().replace(/^0+(\d)/, '$1').toLowerCase();
}

export function detectDelimiter(headerLine: string): ',' | ';' {
  const semis = (headerLine.match(/;/g) ?? []).length;
  const commas = (headerLine.match(/,/g) ?? []).length;
  return semis > commas ? ';' : ',';
}

/** Split a CSV line respecting double quotes. */
export function splitCsvLine(line: string, delimiter: ',' | ';'): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      cells.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

export function parseAmount(raw: string): number | null {
  if (!raw) return null;
  let s = raw.replace(/\s/g, '').replace(/₴|грн|uah/gi, '');
  // 1.234,56 → 1234.56 ; 1,234.56 → 1234.56
  if (/\d,\d{2}$/.test(s) && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/\d,\d{1,2}$/.test(s)) {
    s = s.replace(',', '.');
  } else {
    s = s.replace(/,/g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export function parseDate(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();
  // ISO yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // dd.mm.yyyy or dd/mm/yyyy
  const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m) {
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    return `${m[3]}-${mm}-${dd}`;
  }
  // dd.mm.yy
  const m2 = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2})$/);
  if (m2) {
    const year = Number(m2[3]) >= 70 ? `19${m2[3]}` : `20${m2[3]}`;
    return `${year}-${m2[2].padStart(2, '0')}-${m2[1].padStart(2, '0')}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/["']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface ColumnMap {
  date: number;
  amount: number;
  reference: number;
}

function mapColumns(headers: string[]): ColumnMap | null {
  const normalized = headers.map(normalizeHeader);
  const find = (...names: string[]) =>
    normalized.findIndex((h) => names.some((n) => h === n || h.includes(n)));

  let date = find('date', 'дата', 'data oper', 'дата операції', 'дата операції', 'operation date');
  let amount = find(
    'amount',
    'сума',
    'sum',
    'credit',
    'кредит',
    'надходження',
    'прихід',
  );
  let reference = find(
    'reference',
    'призначення',
    'purpose',
    'опис',
    'details',
    'назначение',
    'коментар',
    'платник',
    'payment purpose',
  );

  // Fallback: first three columns
  if (date < 0 && amount < 0 && headers.length >= 3) {
    date = 0;
    amount = 1;
    reference = 2;
  }
  if (date < 0 || amount < 0) return null;
  if (reference < 0) reference = Math.max(0, headers.length - 1);
  return { date, amount, reference };
}

export function parseBankStatementCsv(csv: string): ParsedStatementRow[] {
  const text = csv.replace(/^\uFEFF/, '').trim();
  if (!text) return [];

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const delimiter = detectDelimiter(lines[0]);
  const firstCells = splitCsvLine(lines[0], delimiter);
  const looksLikeHeader = firstCells.some((c) =>
    /date|дата|amount|сума|призначення|reference|purpose/i.test(c),
  );

  let start = 0;
  let colMap: ColumnMap;
  if (looksLikeHeader) {
    const mapped = mapColumns(firstCells);
    if (!mapped) {
      return [
        {
          line: 1,
          raw: lines[0],
          date: null,
          amount: null,
          reference: '',
          extractedApartment: null,
          status: 'invalid',
          message: 'Не вдалося визначити колонки (потрібні дата, сума, призначення)',
        },
      ];
    }
    colMap = mapped;
    start = 1;
  } else {
    colMap = { date: 0, amount: 1, reference: Math.min(2, firstCells.length - 1) };
  }

  const rows: ParsedStatementRow[] = [];
  for (let i = start; i < lines.length; i++) {
    const lineNo = i + 1;
    const raw = lines[i];
    const cells = splitCsvLine(raw, delimiter);
    const dateRaw = cells[colMap.date] ?? '';
    const amountRaw = cells[colMap.amount] ?? '';
    const reference = cells[colMap.reference] ?? cells.slice(2).join(' ') ?? '';

    const date = parseDate(dateRaw);
    const amount = parseAmount(amountRaw);
    const extractedApartment = extractApartmentNumber(reference);

    if (amount === null || date === null) {
      rows.push({
        line: lineNo,
        raw,
        date,
        amount,
        reference,
        extractedApartment,
        status: 'invalid',
        message: 'Некоректна дата або сума',
      });
      continue;
    }

    if (amount <= 0) {
      rows.push({
        line: lineNo,
        raw,
        date,
        amount,
        reference,
        extractedApartment,
        status: 'skipped',
        message: 'Вихідний/нульовий платіж пропущено',
      });
      continue;
    }

    rows.push({
      line: lineNo,
      raw,
      date,
      amount,
      reference,
      extractedApartment,
      status: extractedApartment ? 'matched' : 'unmatched',
      message: extractedApartment
        ? undefined
        : 'Не знайдено номер квартири в призначенні',
    });
  }

  return rows;
}

export function matchStatementRows(
  rows: ParsedStatementRow[],
  apartments: ApartmentRef[],
): MatchedStatementRow[] {
  const byNumber = new Map<string, ApartmentRef>();
  for (const a of apartments) {
    byNumber.set(normalizeAptNumber(a.number), a);
  }

  return rows.map((row) => {
    if (row.status === 'invalid' || row.status === 'skipped') {
      return { ...row, apartmentId: null, apartmentNumber: null };
    }
    if (!row.extractedApartment) {
      return {
        ...row,
        status: 'unmatched' as const,
        apartmentId: null,
        apartmentNumber: null,
      };
    }
    const apt = byNumber.get(normalizeAptNumber(row.extractedApartment));
    if (!apt) {
      return {
        ...row,
        status: 'unmatched',
        apartmentId: null,
        apartmentNumber: row.extractedApartment,
        message: `Квартиру «${row.extractedApartment}» не знайдено в будинку`,
      };
    }
    return {
      ...row,
      status: 'matched',
      apartmentId: apt.id,
      apartmentNumber: apt.number,
      message: undefined,
    };
  });
}
