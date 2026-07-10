'use client';

import { useEffect } from 'react';
import { setAuthCookie } from '@/lib/auth-cookie';

/** Keeps middleware auth cookie in sync with localStorage (existing sessions). */
export function AuthCookieSync() {
  useEffect(() => {
    const token = localStorage.getItem('dah_token');
    if (token) setAuthCookie(token);
  }, []);

  return null;
}