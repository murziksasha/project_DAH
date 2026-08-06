/**
 * AES-256-GCM encrypt/decrypt for secrets at rest (TOTP).
 * Key: TOTP_ENCRYPTION_KEY (32-byte hex or base64) or derived from JWT_SECRET.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const PREFIX = 'enc:v1:';

function resolveKey(): Buffer {
  const raw =
    process.env.TOTP_ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    'dev-only-insecure-totp-key';
  // SHA-256 → 32 bytes for AES-256
  return createHash('sha256').update(raw).digest();
}

/** Encrypt plaintext; returns prefixed base64 payload. */
export function sealSecret(plain: string): string {
  if (!plain) return plain;
  if (plain.startsWith(PREFIX)) return plain;
  const key = resolveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, enc]).toString('base64url');
}

/** Decrypt or return plaintext if not sealed (legacy rows). */
export function openSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!stored.startsWith(PREFIX)) return stored;
  const buf = Buffer.from(stored.slice(PREFIX.length), 'base64url');
  if (buf.length < 12 + 16 + 1) return null;
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const key = resolveKey();
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
