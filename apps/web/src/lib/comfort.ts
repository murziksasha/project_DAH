export type ComfortMode = 'normal' | 'large';

const STORAGE_KEY = 'dah_comfort';

export function getStoredComfort(): ComfortMode {
  if (typeof window === 'undefined') return 'normal';
  try {
    return localStorage.getItem(STORAGE_KEY) === 'large' ? 'large' : 'normal';
  } catch {
    return 'normal';
  }
}

export function applyComfort(mode: ComfortMode) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-comfort', mode);
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function toggleComfort(): ComfortMode {
  const next: ComfortMode = getStoredComfort() === 'large' ? 'normal' : 'large';
  applyComfort(next);
  return next;
}
