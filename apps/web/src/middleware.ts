import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** Auth is handled client-side; middleware is a no-op to avoid cookie/localStorage conflicts. */
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [],
};