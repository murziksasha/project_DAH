const KEY = 'dah_apartment_id';

/** Fired after apartment selection changes (no full page reload). */
export const APARTMENT_CHANGE_EVENT = 'dah-apartment-change';

export function getSelectedApartmentId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setSelectedApartmentId(id: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Prefer explicit selection, then dah_user.apartmentId. */
export function resolveResidentApartmentId(): string {
  if (typeof window === 'undefined') return '';
  const selected = getSelectedApartmentId();
  if (selected) return selected;
  try {
    const raw = localStorage.getItem('dah_user');
    if (!raw) return '';
    const user = JSON.parse(raw) as { apartmentId?: string | null };
    return user.apartmentId ?? '';
  } catch {
    return '';
  }
}

/** Persist selection into both apartment context and stored user blob. */
export function applyResidentApartmentSelection(apartmentId: string, opts?: { silent?: boolean }) {
  setSelectedApartmentId(apartmentId);
  try {
    const raw = localStorage.getItem('dah_user');
    if (raw) {
      const user = JSON.parse(raw) as Record<string, unknown>;
      user.apartmentId = apartmentId;
      localStorage.setItem('dah_user', JSON.stringify(user));
    }
  } catch {
    /* ignore */
  }
  if (!opts?.silent && typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(APARTMENT_CHANGE_EVENT, { detail: { apartmentId } }),
    );
  }
}

/** Subscribe to apartment switches (client components). */
export function onApartmentChange(handler: (apartmentId: string) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const fn = (e: Event) => {
    const ce = e as CustomEvent<{ apartmentId?: string }>;
    const id = ce.detail?.apartmentId ?? resolveResidentApartmentId();
    if (id) handler(id);
  };
  window.addEventListener(APARTMENT_CHANGE_EVENT, fn);
  return () => window.removeEventListener(APARTMENT_CHANGE_EVENT, fn);
}

/** Query suffix for /accruals/my-account when multi-apt. */
export function myAccountPath(apartmentId?: string): string {
  const id = apartmentId ?? resolveResidentApartmentId();
  return id ? `/accruals/my-account?apartmentId=${encodeURIComponent(id)}` : '/accruals/my-account';
}
