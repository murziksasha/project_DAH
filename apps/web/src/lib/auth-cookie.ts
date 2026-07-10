const COOKIE_NAME = 'dah_token';
const MAX_AGE_SEC = 60 * 60 * 24 * 7;

export function setAuthCookie(accessToken: string): void {
  if (typeof document === 'undefined') return;
  const value = encodeURIComponent(accessToken);
  document.cookie = `${COOKIE_NAME}=${value}; path=/; SameSite=Lax; max-age=${MAX_AGE_SEC}`;
}

export function clearAuthCookie(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0`;
}

export function getAuthCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}