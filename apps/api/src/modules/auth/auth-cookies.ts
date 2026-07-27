import type { Response } from 'express';

export const REFRESH_COOKIE = 'dah_refresh';
export const SESSION_FLAG_COOKIE = 'dah_session';

const REFRESH_PATH = '/api/auth';

function cookieSecure(): boolean {
  return process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production';
}

function refreshMaxAgeMs(): number {
  // Align with default JWT_REFRESH_EXPIRES=7d
  return 7 * 24 * 60 * 60 * 1000;
}

export function setAuthCookies(res: Response, refreshToken: string) {
  const secure = cookieSecure();
  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: REFRESH_PATH,
    maxAge: refreshMaxAgeMs(),
  });
  // Soft non-HttpOnly flag for Next middleware route guards (not a secret).
  res.cookie(SESSION_FLAG_COOKIE, '1', {
    httpOnly: false,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: refreshMaxAgeMs(),
  });
}

export function clearAuthCookies(res: Response) {
  const secure = cookieSecure();
  res.clearCookie(REFRESH_COOKIE, { path: REFRESH_PATH, httpOnly: true, secure, sameSite: 'lax' });
  res.clearCookie(SESSION_FLAG_COOKIE, { path: '/', httpOnly: false, secure, sameSite: 'lax' });
}
