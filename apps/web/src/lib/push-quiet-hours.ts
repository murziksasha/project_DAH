/** Local quiet hours for Web Push (client-side). */

const KEY = 'dah_push_quiet_hours';

export interface QuietHours {
  enabled: boolean;
  /** 0–23 local */
  startHour: number;
  /** 0–23 local */
  endHour: number;
}

const DEFAULT: QuietHours = { enabled: false, startHour: 22, endHour: 8 };

export function getQuietHours(): QuietHours {
  if (typeof window === 'undefined') return DEFAULT;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const p = JSON.parse(raw) as QuietHours;
    return {
      enabled: Boolean(p.enabled),
      startHour: Number.isFinite(p.startHour) ? p.startHour : 22,
      endHour: Number.isFinite(p.endHour) ? p.endHour : 8,
    };
  } catch {
    return DEFAULT;
  }
}

export function setQuietHours(q: QuietHours) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(q));
}

/** True if current local time is inside quiet window (may wrap midnight). */
export function isInQuietHours(now = new Date(), q = getQuietHours()): boolean {
  if (!q.enabled) return false;
  const h = now.getHours();
  if (q.startHour === q.endHour) return true;
  if (q.startHour < q.endHour) {
    return h >= q.startHour && h < q.endHour;
  }
  return h >= q.startHour || h < q.endHour;
}
