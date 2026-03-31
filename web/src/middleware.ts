import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that don't require authentication
const PUBLIC_PATHS = ['/login', '/login/verify', '/registro-proveedor', '/verify'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths, static files, and API routes
  if (
    PUBLIC_PATHS.some((path) => pathname.startsWith(path)) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.') // static files (favicon, manifest, icons)
  ) {
    return NextResponse.next();
  }

  // Check for auth cookie
  const authCookie = request.cookies.get('handy_auth');

  if (!authCookie) {
    // Redirect to login
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except _next/static, _next/image, favicon
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};

