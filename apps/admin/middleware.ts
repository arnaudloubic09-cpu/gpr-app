import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';

/**
 * Protège /dashboard : si le jeton d'accès a expiré mais qu'un refresh token existe,
 * on renouvelle la session de façon transparente ; sinon redirection vers /login.
 */
export async function middleware(req: NextRequest) {
  if (req.cookies.get('gpr_access')) return NextResponse.next();

  const refreshToken = req.cookies.get('gpr_refresh')?.value;
  if (refreshToken) {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (res.ok) {
      const tokens = (await res.json()) as {
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
      };
      const next = NextResponse.redirect(req.nextUrl);
      const opts = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        path: '/',
      };
      next.cookies.set('gpr_access', tokens.accessToken, { ...opts, maxAge: tokens.expiresIn });
      next.cookies.set('gpr_refresh', tokens.refreshToken, { ...opts, maxAge: 30 * 86_400 });
      return next;
    }
  }
  const login = NextResponse.redirect(new URL('/login', req.url));
  login.cookies.delete('gpr_refresh');
  return login;
}

export const config = { matcher: ['/dashboard/:path*'] };
