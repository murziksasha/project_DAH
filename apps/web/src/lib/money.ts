import { formatMinor, roundMoney as roundMoneyCanonical, toMinor } from '@dah/money';

/**
 * Format amounts for Ukrainian locale with hryvnia (L6: canonical @dah/money rounding,
 * always 2 decimals — «1 200,50 ₴», «100,00 ₴»).
 */
export function formatMoney(value: number | string, options?: { signed?: boolean }): string {
  let minor: number;
  try {
    minor = toMinor(typeof value === 'string' ? value : Number(value));
  } catch {
    return '—';
  }
  const n = minor;
  const abs = formatMinor(Math.abs(minor));
  if (options?.signed) {
    if (n > 0) return `+${abs} ₴`;
    if (n < 0) return `−${abs} ₴`;
  }
  if (n < 0) return `−${abs} ₴`;
  return `${abs} ₴`;
}

/** Round major units to 2 dp (display/input hygiene; server is source of truth). */
export function roundMoney(value: number): number {
  return roundMoneyCanonical(value);
}

export function formatDateUk(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('uk-UA');
}
