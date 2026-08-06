/**
 * HMAC-signed short-lived tokens for same-origin file download URLs.
 * Allows <img src> / window.open without Authorization headers.
 */

import { createHmac, timingSafeEqual } from 'crypto';

const KEY_RE = /^(expenses|documents|requests)\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/i;

export function isAllowedStorageKey(key: string): boolean {
  if (!key || key.length > 512 || key.includes('..')) return false;
  return KEY_RE.test(key);
}

export function signFileDownload(
  key: string,
  secret: string,
  expiresInSec = 3600,
): { exp: number; sig: string } {
  const exp = Math.floor(Date.now() / 1000) + expiresInSec;
  const sig = createHmac('sha256', secret).update(`${key}\n${exp}`).digest('base64url');
  return { exp, sig };
}

export function verifyFileDownload(
  key: string,
  exp: number,
  sig: string,
  secret: string,
): boolean {
  if (!isAllowedStorageKey(key)) return false;
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  if (!sig || typeof sig !== 'string') return false;

  const expected = createHmac('sha256', secret).update(`${key}\n${exp}`).digest('base64url');
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(sig);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Relative same-origin path (browser → nginx → API). */
export function buildFileDownloadPath(
  key: string,
  secret: string,
  expiresInSec = 3600,
): string {
  const { exp, sig } = signFileDownload(key, secret, expiresInSec);
  const q = new URLSearchParams({
    key,
    exp: String(exp),
    sig,
  });
  return `/api/files/download?${q.toString()}`;
}
