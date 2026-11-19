/**
 * Canonical money arithmetic in integer minor units (kopiiky).
 * API/DB may still expose major units (hryvnia); convert at boundaries.
 */

/** Integer amount in minor currency units (1 UAH = 100). */
export type Minor = number;

/**
 * Convert major units (hryvnia) to minor (kopiiky).
 * Uses string-normalized rounding to avoid IEEE-754 edge cases.
 */
export function toMinor(major: number | string): Minor {
  if (typeof major === 'string') {
    const trimmed = major.trim().replace(',', '.');
    if (!trimmed || !/^-?\d+(\.\d+)?$/.test(trimmed)) {
      throw new Error('Invalid money value');
    }
    return decimalStringToMinor(trimmed);
  }
  if (!Number.isFinite(major)) throw new Error('Invalid money value');
  // toFixed(6) removes binary float noise (1.005 → "1.005000", 0.1+0.2 → "0.300000"),
  // then rounding is done on decimal digits (half away from zero), not on floats.
  return decimalStringToMinor(major.toFixed(6));
}

/** Exact half-away-from-zero rounding of a decimal string to 2 dp, in minor units. */
function decimalStringToMinor(value: string): Minor {
  const negative = value.startsWith('-');
  const [intPart, fracPart = ''] = (negative ? value.slice(1) : value).split('.');
  const frac = (fracPart + '000').slice(0, 3);
  let minor = Number(intPart) * 100 + Number(frac.slice(0, 2));
  if (Number(frac[2]) >= 5) minor += 1;
  if (!Number.isSafeInteger(minor)) throw new Error('Invalid money value');
  return negative && minor !== 0 ? -minor : minor;
}

/** Convert minor units to major (hryvnia) number for display/API. */
export function toMajor(minor: Minor): number {
  if (!Number.isSafeInteger(minor)) {
    throw new Error('Minor amount must be a safe integer');
  }
  return minor / 100;
}

/**
 * Round a major-unit value to 2 decimal places via minor units.
 * Prefer `toMinor`/`toMajor` for new code; kept for call-site compatibility.
 */
export function roundMoney(value: number | string): number {
  return toMajor(toMinor(value));
}

export function addMinor(...values: Minor[]): Minor {
  let sum = 0;
  for (const v of values) {
    if (!Number.isSafeInteger(v)) throw new Error('Minor amount must be a safe integer');
    sum += v;
  }
  if (!Number.isSafeInteger(sum)) throw new Error('Money sum out of range');
  return sum;
}

export function subMinor(a: Minor, b: Minor): Minor {
  return addMinor(a, -b);
}

export function minMinor(a: Minor, b: Minor): Minor {
  return a < b ? a : b;
}

export function maxMinor(a: Minor, b: Minor): Minor {
  return a > b ? a : b;
}

/** Format major units for UA locale (without currency symbol). */
export function formatMajor(major: number, locale = 'uk-UA'): string {
  return major.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatMinor(minor: Minor, locale = 'uk-UA'): string {
  return formatMajor(toMajor(minor), locale);
}
