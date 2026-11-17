import { redirect } from 'next/navigation';
import { getMe } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Point d'entrée : chaque rôle est envoyé vers son espace. */
export default async function DashboardPage() {
  const me = await getMe();
  if (me?.role === 'SUPER_ADMIN') redirect('/admin');
  if (me?.role === 'CLUB_ADMIN' && me.clubId) redirect(`/clubs/${me.clubId}`);
  redirect('/login');
}
