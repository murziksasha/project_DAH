export type ApartmentCsvRow = {
  number: string;
  entrance: number;
  floor?: number;
  area: number;
  /** Raw "Мешканці" cell (names/emails), optional */
  residentsRaw?: string;
  line: number;
};

/**
 * Parse apartment registry CSV.
 * Columns: number, entrance, floor?, area [, residents]
 * Header row optional (detected by number+area labels).
 */
export function parseApartmentsCsv(csv: string): {
  rows: ApartmentCsvRow[];
  errors: Array<{ line: number; message: string }>;
} {
  const text = csv.replace(/^\uFEFF/, '').trim();
  const errors: Array<{ line: number; message: string }> = [];
  if (!text) {
    return { rows: [], errors: [{ line: 0, message: 'Порожній CSV' }] };
  }

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const byNumber = new Map<string, ApartmentCsvRow>();

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const lineNo = i + 1;

    if (i === 0 && /номер|number|кв/i.test(raw) && /площа|area/i.test(raw)) {
      continue;
    }

    const parts = raw.split(/[,;\t]/).map((p) => p.trim().replace(/^"|"$/g, ''));
    if (parts.length < 2) {
      errors.push({ line: lineNo, message: "Очікується number,entrance,floor,area[,мешканці]" });
      continue;
    }

    const number = parts[0];
    let entrance = 1;
    let floor: number | undefined;
    let area: number;
    let residentsRaw: string | undefined;

    if (parts.length === 2) {
      area = Number(parts[1].replace(',', '.'));
    } else if (parts.length === 3) {
      entrance = Number(parts[1]) || 1;
      area = Number(parts[2].replace(',', '.'));
    } else {
      entrance = Number(parts[1]) || 1;
      floor = parts[2] ? Number(parts[2]) : undefined;
      area = Number(parts[3].replace(',', '.'));
      if (parts.length >= 5 && parts.slice(4).join(',').trim()) {
        residentsRaw = parts.slice(4).join(',').trim();
      }
    }

    if (!number || !Number.isFinite(area) || area <= 0) {
      errors.push({ line: lineNo, message: 'Некоректний номер або площа' });
      continue;
    }
    if (floor !== undefined && !Number.isFinite(floor)) {
      floor = undefined;
    }

    byNumber.set(number, {
      number,
      entrance,
      floor: Number.isFinite(floor as number) ? floor : undefined,
      area,
      residentsRaw,
      line: lineNo,
    });
  }

  return { rows: [...byNumber.values()], errors };
}

/** Extract emails from "Ім'я Прізвище <email@x>" or bare email lists. */
export function extractEmailsFromResidentsCell(raw?: string): string[] {
  if (!raw?.trim()) return [];
  const emails = new Set<string>();
  const angle = raw.matchAll(/<([^>]+@[^>]+)>/g);
  for (const m of angle) {
    emails.add(m[1].trim().toLowerCase());
  }
  const bare = raw.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  for (const m of bare) {
    emails.add(m[0].trim().toLowerCase());
  }
  return [...emails];
}
