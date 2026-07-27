/** Format amounts for Ukrainian locale with hryvnia. */
export function formatMoney(value: number | string, options?: { signed?: boolean }): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n).toLocaleString('uk-UA', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  if (options?.signed) {
    if (n > 0) return `+${abs} ₴`;
    if (n < 0) return `−${abs} ₴`;
  }
  if (n < 0) return `−${abs} ₴`;
  return `${abs} ₴`;
}

/** Round major units to 2 dp (display/input hygiene; server is source of truth). */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatDateUk(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('uk-UA');
}
