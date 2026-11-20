import { cookies } from 'next/headers';
import { PARTNER_COOKIE } from '@/lib/partner';

/**
 * Lien personnel du partenaire local : reconnaît ce téléphone (cookie) puis ouvre sa page.
 * Le partenaire l'ouvre une fois sur le téléphone qui servira à scanner les QR codes des joueurs.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[\w-]{20,100}$/.test(token)) return new Response('Lien invalide', { status: 404 });
  (await cookies()).set(PARTNER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/partenaire',
    maxAge: 400 * 86_400,
  });
  return new Response(null, { status: 303, headers: { Location: '/partenaire' } });
}
