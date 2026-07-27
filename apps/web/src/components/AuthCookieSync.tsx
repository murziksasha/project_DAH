'use client';

import { useEffect } from 'react';
import { getToken, refreshAccessToken } from '@/lib/api';
import { setSessionFlagCookie } from '@/lib/auth-cookie';

/**
 * On load: ensure soft session flag matches access token presence.
 * If access token missing but refresh cookie may exist — silent refresh.
 */
export function AuthCookieSync() {
  useEffect(() => {
    const token = getToken();
    if (token) {
      setSessionFlagCookie();
      return;
    }
    // Try cookie-based refresh (e.g. new tab with HttpOnly refresh only)
    void refreshAccessToken().then((access) => {
      if (access) setSessionFlagCookie();
    });
  }, []);

  return null;
}
