/**
 * Natural apartment number order: 1, 2, 10, 11 (not 1, 10, 11, 2).
 * Handles mixed labels like "12А" via localeCompare numeric.
 */
export function compareApartmentNumbers(a: string, b: string): number {
  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

export function sortByApartmentNumber<T extends { number: string; entrance?: number }>(
  items: T[],
): T[] {
  return [...items].sort((x, y) => {
    const e = (x.entrance ?? 0) - (y.entrance ?? 0);
    if (e !== 0) return e;
    return compareApartmentNumbers(x.number, y.number);
  });
}
