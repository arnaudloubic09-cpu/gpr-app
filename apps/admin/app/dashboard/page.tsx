import { redirect } from 'next/navigation';
import { getMe } from '@/lib/session';
import { logoutAction } from '../login/actions';

export const dynamic = 'force-dynamic';

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super admin GPR',
  CLUB_ADMIN: 'Admin club',
};

/** Accueil du back-office (contenu complet en phase 4). */
export default async function DashboardPage() {
  const me = await getMe();
  if (!me || !(me.role in ROLE_LABELS)) redirect('/login');

  return (
    <main>
      <div className="card">
        <span className="badge">{ROLE_LABELS[me.role]}</span>
        <h1>Bonjour {me.firstName ?? me.email}</h1>
        <p className="muted">
          {me.role === 'SUPER_ADMIN'
            ? 'Gestion des clubs, connecteurs, règles GPR et statistiques globales : disponible en phase 4.'
            : 'Catalogue de récompenses, validation des coupons et statistiques de votre club : disponible en phase 4.'}
        </p>
        <form action={logoutAction}>
          <button className="secondary">Se déconnecter</button>
        </form>
      </div>
    </main>
  );
}
