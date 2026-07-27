import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Soft auth gate via non-HttpOnly session flag (set on login / by API).
 * Real authorization remains on the API (JWT + RBAC).
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession =
    request.cookies.get('dah_session')?.value === '1' ||
    // Legacy soft cookie during rollout
    Boolean(request.cookies.get('dah_token')?.value);
  const isAuthPage = pathname === '/login' || pathname === '/register';
  const isProtected =
    pathname.startsWith('/admin') || pathname.startsWith('/resident');

  if (isProtected && !hasSession) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', pathname);
    return NextResponse.redirect(login);
  }

  if (isAuthPage && hasSession) {
    // Let client-side role router decide home; avoid loop on login during 2FA
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/resident/:path*', '/login', '/register'],
};
