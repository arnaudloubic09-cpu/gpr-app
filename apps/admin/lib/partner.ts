import 'server-only';
import { cookies } from 'next/headers';
import { errorMessage } from './api';
import { API_URL } from './session';

/** Cookie du téléphone du partenaire local (posé par son lien personnel). */
export const PARTNER_COOKIE = 'gpr_partner';

export async function partnerToken() {
  return (await cookies()).get(PARTNER_COOKIE)?.value;
}

export type PartnerResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

/** Appel à l'API au nom du partenaire (sans compte : reconnu par son lien personnel). */
export async function partnerCall<T>(
  path: string,
  method: 'GET' | 'POST' = 'GET',
): Promise<PartnerResult<T>> {
  const token = await partnerToken();
  const res = await fetch(`${API_URL}/partner-portal${path}`, {
    method,
    cache: 'no-store',
    headers: token ? { 'x-partner-token': token } : {},
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, status: res.status, error: errorMessage(body) };
  return { ok: true, data: body as T };
}
