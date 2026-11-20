/**
 * M18: in-process cache of authenticated principals (AUTH_CACHE_TTL_MS, default off).
 * Kept outside the JWT strategy so the Prisma layer can invalidate it without import cycles.
 */
export const AUTH_CACHE_MAX = 5000;

export const authCache = new Map<string, { user: unknown; expires: number }>();

/** Drop cached principals (all, or of one user) — called on any auth-relevant write. */
export function invalidateAuthCache(userId?: string): void {
  if (authCache.size === 0) return;
  if (!userId) {
    authCache.clear();
    return;
  }
  for (const k of authCache.keys()) if (k.startsWith(`${userId}:`)) authCache.delete(k);
}
