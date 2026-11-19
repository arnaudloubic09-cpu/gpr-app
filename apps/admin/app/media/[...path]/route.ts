import { API_URL } from '@/lib/session';

/**
 * Images publiques de l'API (logos des clubs et des partenaires) servies par le back-office :
 * le navigateur ne peut pas joindre l'adresse interne de l'API (http://api:3000 en production).
 */
const ALLOWED = /^(clubs|local-partners)\/[0-9a-f-]{36}\/logo$/;

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.join('/');
  if (!ALLOWED.test(path)) return new Response('Introuvable', { status: 404 });
  const res = await fetch(`${API_URL}/${path}${new URL(req.url).search}`, { cache: 'no-store' });
  if (!res.ok) return new Response('Introuvable', { status: 404 });
  return new Response(res.body, {
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
