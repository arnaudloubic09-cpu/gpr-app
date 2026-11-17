import 'server-only';
import { cookies } from 'next/headers';
import type { AuthTokens, MeResponse } from '@gpr/core';

/**
 * Les jetons ne quittent jamais le serveur Next : ils sont stockés en cookies httpOnly
 * et le navigateur n'y a pas accès (protection contre le vol par XSS).
 */
export const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const ACCESS = 'gpr_access';
const REFRESH = 'gpr_refresh';

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

export async function saveTokens(tokens: AuthTokens) {
  const jar = await cookies();
  jar.set(ACCESS, tokens.accessToken, { ...cookieOptions, maxAge: tokens.expiresIn });
  jar.set(REFRESH, tokens.refreshToken, { ...cookieOptions, maxAge: 30 * 86_400 });
}

export async function clearTokens() {
  const jar = await cookies();
  jar.delete(ACCESS);
  jar.delete(REFRESH);
}

export async function getRefreshToken() {
  return (await cookies()).get(REFRESH)?.value;
}

/** Profil de l'admin connecté, ou null. (Le renouvellement des jetons est fait par le middleware.) */
export async function getMe(): Promise<MeResponse | null> {
  const access = (await cookies()).get(ACCESS)?.value;
  if (!access) return null;
  const res = await fetch(`${API_URL}/me`, {
    headers: { Authorization: `Bearer ${access}` },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return (await res.json()) as MeResponse;
}
