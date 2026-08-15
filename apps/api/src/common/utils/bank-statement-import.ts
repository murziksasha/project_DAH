/**
 * Bank statement import — format-agnostic adapters.
 * Profiles: auto | generic_csv | privatbank | monobank | oschadbank | mt940
 * Any bank that exports CSV/MT940 maps into the same row model for matching.
 */

export type ImportRowStatus = 'matched' | 'unmatched' | 'skipped' | 'invalid';

/** Known statement formats (extensible registry). */
export type StatementFormat =
  | 'auto'
  | 'generic_csv'
  | 'privatbank'
  | 'monobank'
  | 'oschadbank'
  | 'mt940';

export const STATEMENT_FORMATS: StatementFormat[] = [
  'auto',
  'generic_csv',
  'privatbank',
  'monobank',
  'oschadbank',
  'mt940',
];

export interface ParsedStatementRow {
  line: number;
  raw: string;
  date: string | null;
  amount: number | null;
  reference: string;
  /** Payer IBAN / account if parsed */
  counterpartyIban?: string | null;
  extractedApartment: string | null;
  status: ImportRowStatus;
  message?: string;
  /** Which adapter produced the row */
  format?: StatementFormat;
}

export type MatchMethod =
  | 'apartment'
  | 'iban'
  | 'iban_alias'
  | 'name'
  | 'manual'
  | null;

export interface MatchCandidate {
  apartmentId: string;
  apartmentNumber: string;
  method: Exclude<MatchMethod, null>;
  confidence: number;
}

export interface MatchedStatementRow extends ParsedStatementRow {
  apartmentId: string | null;
  apartmentNumber: string | null;
  /** 0–1 confidence of auto-match (null if invalid/skipped) */
  confidence?: number | null;
  matchMethod?: MatchMethod;
  candidates?: MatchCandidate[];
}

export interface ApartmentRef {
  id: string;
  number: string;
  entrance?: number;
}

export interface ParseStatementOptions {
  /** Explicit format; default auto */
  format?: StatementFormat;
}

export interface ParseStatementResult {
  format: StatementFormat;
  detectedFormat: StatementFormat;
  rows: ParsedStatementRow[];
}

const APARTMENT_PATTERNS = [
  /кв\.?\s*№?\s*([0-9]+[а-яa-z]?)/i,
  /квартир[аеиуы]?\s*№?\s*([0-9]+[а-яa-z]?)/i,
  /apt\.?\s*#?\s*([0-9]+[а-яa-z]?)/i,
  /#\s*([0-9]+[а-яa-z]?)\b/i,
  /\bflat\s*([0-9]+[а-яa-z]?)/i,
  /** UA payment purpose: "101" alone after "оплата" */
  /оплат[аи]\s+(?:за\s+)?(?:послуг[иі]\s+)?(?:жк[гх]?\s+)?кв\.?\s*([0-9]+[а-яa-z]?)/i,
];

/** Header aliases per bank profile (substring match on normalized header). */
const PROFILE_DATE_ALIASES: Record<string, string[]> = {
  generic_csv: ['date', 'дата', 'data oper', 'дата операції', 'operation date', 'дата проводки'],
  privatbank: [
    'дата',
    'date',
    'дата операції',
    'дата проводки',
    'дата транзакції',
    'transaction date',
  ],
  monobank: ['date', 'time', 'дата', 'дата і час', 'datetime'],
  oschadbank: ['дата', 'date', 'дата операції', 'дата документа'],
};

const PROFILE_AMOUNT_ALIASES: Record<string, string[]> = {
  generic_csv: [
    'amount',
    'сума',
    'sum',
    'credit',
    'кредит',
    'надходження',
    'прихід',
    'сума в валюті картки',
  ],
  privatbank: ['сума', 'amount', 'кредит', 'сума у валюті рахунку', 'надходження'],
  monobank: ['amount', 'сума', 'card amount', 'operation amount'],
  oschadbank: ['сума', 'amount', 'сума кредиту', 'кредит', 'надходження'],
};

const PROFILE_REF_ALIASES: Record<string, string[]> = {
  generic_csv: [
    'reference',
    'призначення',
    'purpose',
    'опис',
    'details',
    'назначение',
    'коментар',
    'платник',
    'payment purpose',
    'опис операції',
  ],
  privatbank: [
    'призначення',
    'призначення платежу',
    'опис',
    'коментар',
    'платник',
    'назва контрагента',
  ],
  monobank: ['description', 'comment', 'опис', 'призначення', 'details'],
  oschadbank: ['призначення', 'призначення платежу', 'опис', 'підстава'],
};

const PROFILE_IBAN_ALIASES: Record<string, string[]> = {
  generic_csv: ['iban', 'рахунок', 'рахунок платника', 'counterparty account', 'from account'],
  privatbank: ['рахунок', 'рахунок контрагента', 'iban', 'едрпоу'],
  monobank: ['iban', 'account'],
  oschadbank: ['рахунок', 'рахунок платника', 'iban'],
};

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

export function detectDelimiter(headerLine: string): ',' | ';' | '\t' {
  const semis = (headerLine.match(/;/g) ?? []).length;
  const commas = (headerLine.match(/,/g) ?? []).length;
  const tabs = (headerLine.match(/\t/g) ?? []).length;
  if (tabs > semis && tabs > commas) return '\t';
  return semis > commas ? ';' : ',';
}

/** Split a CSV line respecting double quotes. */
export function splitCsvLine(line: string, delimiter: ',' | ';' | '\t'): string[] {
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
  let s = raw.replace(/\s/g, '').replace(/₴|грн|uah|uah\.?/gi, '');
  // 1.234,56 → 1234.56 ; 1,234.56 → 1234.56
  if (/\d,\d{2}$/.test(s) && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/\d,\d{1,2}$/.test(s)) {
    s = s.replace(',', '.');
  } else {
    s = s.replace(/,/g, '');
  }
  // MT940 style trailing comma: 450,
  if (s.endsWith('.')) s = s.slice(0, -1);
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export function parseDate(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();
  // ISO yyyy-mm-dd or with time
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
  // yyMMdd (MT940 value date fragment)
  const m3 = s.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (m3) {
    const year = Number(m3[1]) >= 70 ? `19${m3[1]}` : `20${m3[1]}`;
    return `${year}-${m3[2]}-${m3[3]}`;
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
  iban: number;
}

function csvProfileKey(
  format: StatementFormat,
): 'generic_csv' | 'privatbank' | 'monobank' | 'oschadbank' {
  if (format === 'privatbank' || format === 'monobank' || format === 'oschadbank') {
    return format;
  }
  return 'generic_csv';
}

function mapColumns(headers: string[], format: StatementFormat): ColumnMap | null {
  const profile = csvProfileKey(format);
  const normalized = headers.map(normalizeHeader);
  const find = (names: string[]) =>
    normalized.findIndex((h) => names.some((n) => h === n || h.includes(n)));

  let date = find(PROFILE_DATE_ALIASES[profile] ?? PROFILE_DATE_ALIASES.generic_csv);
  let amount = find(PROFILE_AMOUNT_ALIASES[profile] ?? PROFILE_AMOUNT_ALIASES.generic_csv);
  let reference = find(PROFILE_REF_ALIASES[profile] ?? PROFILE_REF_ALIASES.generic_csv);
  let iban = find(PROFILE_IBAN_ALIASES[profile] ?? PROFILE_IBAN_ALIASES.generic_csv);

  // Cross-profile fallback
  if (date < 0) date = find(PROFILE_DATE_ALIASES.generic_csv);
  if (amount < 0) amount = find(PROFILE_AMOUNT_ALIASES.generic_csv);
  if (reference < 0) reference = find(PROFILE_REF_ALIASES.generic_csv);

  if (date < 0 && amount < 0 && headers.length >= 3) {
    date = 0;
    amount = 1;
    reference = 2;
  }
  if (date < 0 || amount < 0) return null;
  if (reference < 0) reference = Math.max(0, headers.length - 1);
  return { date, amount, reference, iban };
}

/** Heuristic: MT940 starts with :20: / :25: / :61: tags. */
export function looksLikeMt940(text: string): boolean {
  const head = text.slice(0, 400);
  return /:20:/.test(head) || /:25:/.test(head) || /:61:/.test(head);
}

/** Guess CSV bank profile from header labels. */
export function guessCsvBankProfile(headerLine: string): StatementFormat {
  const h = normalizeHeader(headerLine);
  if (/моно|monobank|card amount|operation amount/i.test(h)) return 'monobank';
  if (/приват|privat|назва контрагента|сума у валюті рахунку/i.test(h)) return 'privatbank';
  if (/ощад|oschad|підстава|сума кредиту/i.test(h)) return 'oschadbank';
  return 'generic_csv';
}

export function detectStatementFormat(text: string): StatementFormat {
  const t = text.replace(/^\uFEFF/, '').trim();
  if (!t) return 'generic_csv';
  if (looksLikeMt940(t)) return 'mt940';
  const first = t.split(/\r?\n/).find((l) => l.trim()) ?? '';
  return guessCsvBankProfile(first);
}

/**
 * Minimal MT940 / SWIFT statement parser (credit lines only).
 * :61: value date + C/D amount; following :86: is narrative.
 */
export function parseMt940(text: string): ParsedStatementRow[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const rows: ParsedStatementRow[] = [];
  let i = 0;
  let lineNo = 0;

  while (i < lines.length) {
    lineNo = i + 1;
    const line = lines[i];
    const m61 = line.match(/^:61:(\d{6})(\d{4})?([CD])([A-Z]?)([0-9,]+\d)(.*)$/i);
    if (!m61) {
      i++;
      continue;
    }

    const date = parseDate(m61[1]);
    const cd = m61[3].toUpperCase();
    let amount = parseAmount(m61[5].replace(',', '.'));
    if (amount != null && cd === 'D') amount = -Math.abs(amount);
    if (amount != null && cd === 'C') amount = Math.abs(amount);

    // Collect :86: narrative (may span lines until next tag)
    let narrative = m61[6] ?? '';
    i++;
    while (i < lines.length && !/^:\d{2}/.test(lines[i])) {
      narrative += ' ' + lines[i];
      i++;
    }
    if (i < lines.length && /^:86:/.test(lines[i])) {
      narrative += ' ' + lines[i].replace(/^:86:/, '');
      i++;
      while (i < lines.length && !/^:\d{2}/.test(lines[i])) {
        narrative += ' ' + lines[i];
        i++;
      }
    }

    const reference = narrative.replace(/\s+/g, ' ').trim();
    const extractedApartment = extractApartmentNumber(reference);
    const raw = line + (reference ? ` | ${reference}` : '');

    if (amount === null || date === null) {
      rows.push({
        line: lineNo,
        raw,
        date,
        amount,
        reference,
        extractedApartment,
        status: 'invalid',
        message: 'MT940: некоректна дата або сума',
        format: 'mt940',
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
        message: 'Вихідний/дебетовий рядок пропущено',
        format: 'mt940',
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
      message: extractedApartment ? undefined : 'Не знайдено номер квартири в :86:',
      format: 'mt940',
    });
  }

  return rows;
}

function parseCsvWithProfile(csv: string, format: StatementFormat): ParsedStatementRow[] {
  const text = csv.replace(/^\uFEFF/, '').trim();
  if (!text) return [];

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const delimiter = detectDelimiter(lines[0]);
  const firstCells = splitCsvLine(lines[0], delimiter);
  const looksLikeHeader = firstCells.some((c) =>
    /date|дата|amount|сума|призначення|reference|purpose|опис|description|credit/i.test(c),
  );

  let start = 0;
  let colMap: ColumnMap;
  if (looksLikeHeader) {
    const mapped = mapColumns(firstCells, format);
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
          format,
        },
      ];
    }
    colMap = mapped;
    start = 1;
  } else {
    colMap = {
      date: 0,
      amount: 1,
      reference: Math.min(2, firstCells.length - 1),
      iban: -1,
    };
  }

  const rows: ParsedStatementRow[] = [];
  for (let i = start; i < lines.length; i++) {
    const lineNo = i + 1;
    const raw = lines[i];
    const cells = splitCsvLine(raw, delimiter);
    const dateRaw = cells[colMap.date] ?? '';
    const amountRaw = cells[colMap.amount] ?? '';
    const reference = cells[colMap.reference] ?? cells.slice(2).join(' ') ?? '';
    const ibanRaw = colMap.iban >= 0 ? (cells[colMap.iban] ?? '') : '';

    const date = parseDate(dateRaw);
    const amount = parseAmount(amountRaw);
    const extractedApartment = extractApartmentNumber(reference);
    const counterpartyIban = ibanRaw && /UA\d{2}/i.test(ibanRaw) ? ibanRaw.replace(/\s/g, '') : null;

    if (amount === null || date === null) {
      rows.push({
        line: lineNo,
        raw,
        date,
        amount,
        reference,
        counterpartyIban,
        extractedApartment,
        status: 'invalid',
        message: 'Некоректна дата або сума',
        format,
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
        counterpartyIban,
        extractedApartment,
        status: 'skipped',
        message: 'Вихідний/нульовий платіж пропущено',
        format,
      });
      continue;
    }

    rows.push({
      line: lineNo,
      raw,
      date,
      amount,
      reference,
      counterpartyIban,
      extractedApartment,
      status: extractedApartment ? 'matched' : 'unmatched',
      message: extractedApartment ? undefined : 'Не знайдено номер квартири в призначенні',
      format,
    });
  }

  return rows;
}

/** Main entry: parse any supported bank export. */
export function parseBankStatement(
  text: string,
  options: ParseStatementOptions = {},
): ParseStatementResult {
  const requested = options.format ?? 'auto';
  const detected = detectStatementFormat(text);
  const format: StatementFormat =
    requested === 'auto' ? detected : requested === 'generic_csv' ? 'generic_csv' : requested;

  let rows: ParsedStatementRow[];
  if (format === 'mt940') {
    rows = parseMt940(text);
  } else {
    rows = parseCsvWithProfile(text, format);
  }

  return {
    format,
    detectedFormat: detected,
    rows,
  };
}

/** @deprecated Prefer parseBankStatement — kept for callers/tests */
export function parseBankStatementCsv(csv: string): ParsedStatementRow[] {
  return parseBankStatement(csv, { format: 'auto' }).rows;
}

export interface MatchResidentRef {
  apartmentId: string;
  apartmentNumber: string;
  firstName: string;
  lastName: string;
  iban?: string | null;
}

export interface IbanAliasRef {
  iban: string;
  apartmentId: string;
  apartmentNumber: string;
}

export interface MatchContext {
  apartments: ApartmentRef[];
  /** Optional residents for IBAN + full-name matching */
  residents?: MatchResidentRef[];
  /** Learned IBAN → apartment from prior manual matches */
  ibanAliases?: IbanAliasRef[];
  /** Auto-accept threshold (default 0.85) */
  autoMatchMinConfidence?: number;
}

/** Confidence scores by strategy (higher wins). */
export const MATCH_CONFIDENCE = {
  apartment: 0.95,
  iban: 0.92,
  iban_alias: 0.9,
  name: 0.65,
} as const;

export function normalizeIban(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = value.replace(/\s+/g, '').toUpperCase();
  return /^UA\d{2}[A-Z0-9]{20,}$/i.test(s) || /^[A-Z]{2}\d{2}[A-Z0-9]+$/i.test(s)
    ? s
    : s.length >= 15
      ? s
      : null;
}

/** Extract UA IBAN from free text (purpose / counterparty). */
export function extractIbanFromText(text: string): string | null {
  if (!text) return null;
  const m = text.replace(/\s+/g, ' ').match(/\b(UA\d{2}\s*(?:\d\s*){25,27})\b/i);
  if (m) return normalizeIban(m[1]);
  const m2 = text.replace(/\s+/g, '').match(/(UA\d{27})/i);
  return m2 ? normalizeIban(m2[1]) : null;
}

export function normalizePersonName(last: string, first: string): string {
  return `${last} ${first}`
    .toLowerCase()
    .replace(/[ʼ'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Match by apartment #, IBAN, learned alias, then resident full name.
 * Collects candidates with confidence; picks best if above threshold.
 */
export function matchStatementRows(
  rows: ParsedStatementRow[],
  apartmentsOrCtx: ApartmentRef[] | MatchContext,
): MatchedStatementRow[] {
  const ctx: MatchContext = Array.isArray(apartmentsOrCtx)
    ? { apartments: apartmentsOrCtx }
    : apartmentsOrCtx;
  const minConf = ctx.autoMatchMinConfidence ?? 0.85;

  const byNumber = new Map<string, ApartmentRef>();
  for (const a of ctx.apartments) {
    byNumber.set(normalizeAptNumber(a.number), a);
  }

  const byIban = new Map<string, { id: string; number: string }>();
  const byAlias = new Map<string, { id: string; number: string }>();
  const byName = new Map<string, { id: string; number: string }>();
  for (const r of ctx.residents ?? []) {
    const iban = normalizeIban(r.iban ?? null);
    if (iban) byIban.set(iban, { id: r.apartmentId, number: r.apartmentNumber });
    byName.set(normalizePersonName(r.lastName, r.firstName), {
      id: r.apartmentId,
      number: r.apartmentNumber,
    });
    byName.set(normalizePersonName(r.firstName, r.lastName), {
      id: r.apartmentId,
      number: r.apartmentNumber,
    });
  }
  for (const a of ctx.ibanAliases ?? []) {
    const iban = normalizeIban(a.iban);
    if (iban) byAlias.set(iban, { id: a.apartmentId, number: a.apartmentNumber });
  }

  return rows.map((row) => {
    if (row.status === 'invalid' || row.status === 'skipped') {
      return {
        ...row,
        apartmentId: null,
        apartmentNumber: null,
        confidence: null,
        matchMethod: null,
        candidates: [],
      };
    }

    const candidates: MatchCandidate[] = [];

    // 1) Apartment number in purpose
    if (row.extractedApartment) {
      const apt = byNumber.get(normalizeAptNumber(row.extractedApartment));
      if (apt) {
        candidates.push({
          apartmentId: apt.id,
          apartmentNumber: apt.number,
          method: 'apartment',
          confidence: MATCH_CONFIDENCE.apartment,
        });
      }
    }

    // 2) Counterparty / text IBAN → resident profile
    const iban =
      normalizeIban(row.counterpartyIban ?? null) ?? extractIbanFromText(row.reference);
    if (iban) {
      const hit = byIban.get(iban);
      if (hit) {
        candidates.push({
          apartmentId: hit.id,
          apartmentNumber: hit.number,
          method: 'iban',
          confidence: MATCH_CONFIDENCE.iban,
        });
      }
      const alias = byAlias.get(iban);
      if (alias) {
        candidates.push({
          apartmentId: alias.id,
          apartmentNumber: alias.number,
          method: 'iban_alias',
          confidence: MATCH_CONFIDENCE.iban_alias,
        });
      }
    }

    // 3) Full name of resident in purpose
    const refNorm = row.reference
      .toLowerCase()
      .replace(/[ʼ'`]/g, '')
      .replace(/\s+/g, ' ');
    for (const [nameKey, hit] of byName) {
      if (nameKey.length >= 5 && refNorm.includes(nameKey)) {
        candidates.push({
          apartmentId: hit.id,
          apartmentNumber: hit.number,
          method: 'name',
          confidence: MATCH_CONFIDENCE.name,
        });
      }
    }

    // Dedupe by apartment — keep highest confidence
    const bestByApt = new Map<string, MatchCandidate>();
    for (const c of candidates) {
      const prev = bestByApt.get(c.apartmentId);
      if (!prev || c.confidence > prev.confidence) bestByApt.set(c.apartmentId, c);
    }
    const unique = [...bestByApt.values()].sort((a, b) => b.confidence - a.confidence);

    // Conflicting high-confidence apartments → demote
    if (unique.length >= 2 && unique[0].confidence - unique[1].confidence < 0.05) {
      return {
        ...row,
        status: 'unmatched' as const,
        apartmentId: null,
        apartmentNumber: row.extractedApartment,
        confidence: unique[0].confidence,
        matchMethod: null,
        candidates: unique,
        counterpartyIban: iban ?? row.counterpartyIban,
        message: 'Кілька кандидатів з близькою впевненістю — потрібне ручне зіставлення',
      };
    }

    const best = unique[0];
    if (best && best.confidence >= minConf) {
      const labels: Record<string, string> = {
        apartment: 'Зіставлено за номером квартири',
        iban: 'Зіставлено за IBAN мешканця',
        iban_alias: 'Зіставлено за збереженим IBAN',
        name: 'Зіставлено за ПІБ мешканця',
      };
      return {
        ...row,
        status: 'matched',
        apartmentId: best.apartmentId,
        apartmentNumber: best.apartmentNumber,
        confidence: best.confidence,
        matchMethod: best.method,
        candidates: unique,
        counterpartyIban: iban ?? row.counterpartyIban,
        message: `${labels[best.method] ?? 'Зіставлено'} (${Math.round(best.confidence * 100)}%)`,
      };
    }

    // Low-confidence name-only → suggest but leave unmatched for review
    if (best) {
      return {
        ...row,
        status: 'unmatched' as const,
        apartmentId: null,
        apartmentNumber: best.apartmentNumber,
        confidence: best.confidence,
        matchMethod: null,
        candidates: unique,
        counterpartyIban: iban ?? row.counterpartyIban,
        message: `Низька впевненість (${Math.round(best.confidence * 100)}%) — підтвердіть квартиру`,
      };
    }

    return {
      ...row,
      status: 'unmatched' as const,
      apartmentId: null,
      apartmentNumber: row.extractedApartment,
      confidence: null,
      matchMethod: null,
      candidates: [],
      counterpartyIban: iban ?? row.counterpartyIban,
      message: row.extractedApartment
        ? `Квартиру «${row.extractedApartment}» не знайдено; IBAN/ПІБ також без збігу`
        : 'Не знайдено квартиру / IBAN / ПІБ у призначенні',
    };
  });
}
