/** Soft session flag for Next middleware (not a secret). HttpOnly refresh lives on API. */
const SESSION_FLAG = 'dah_session';
const LEGACY_TOKEN_COOKIE = 'dah_token';
const MAX_AGE_SEC = 60 * 60 * 24 * 7;

export function setSessionFlagCookie(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${SESSION_FLAG}=1; path=/; SameSite=Lax; max-age=${MAX_AGE_SEC}`;
}

export function clearSessionFlagCookie(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${SESSION_FLAG}=; path=/; max-age=0`;
  // Clear legacy non-HttpOnly JWT cookie if present
  document.cookie = `${LEGACY_TOKEN_COOKIE}=; path=/; max-age=0`;
}

/** @deprecated Use setSessionFlagCookie — access JWT must not live in document.cookie */
export function setAuthCookie(_accessToken: string): void {
  setSessionFlagCookie();
}

export function clearAuthCookie(): void {
  clearSessionFlagCookie();
}

export function getAuthCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${SESSION_FLAG}=([^;]*)`));
  return match ? match[1] : null;
}
