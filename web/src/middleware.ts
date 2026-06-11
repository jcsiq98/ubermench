import { NextResponse } from 'next/server';

// All remaining routes are public: landing, /payment (Stripe return pages),
// /privacy. The marketplace auth flow (handy_auth cookie) was retired with
// Handy — see HISTORIA_DECISIONES.md Cap. 59.
export function middleware() {
  return NextResponse.next();
}
