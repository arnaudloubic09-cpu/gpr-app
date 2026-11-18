import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { NavGroup, Sidebar } from '@/components/sidebar';
import { apiGet } from '@/lib/api';
import { getMe } from '@/lib/session';
import { logoutAction } from '../login/actions';

type Club = { id: string; name: string };

const clubItems = (id: string) => [
  { href: `/clubs/${id}`, label: 'Tableau de bord' },
  { href: `/clubs/${id}/comptoir`, label: 'Comptoir : valider un coupon' },
  { href: `/clubs/${id}/recompenses`, label: 'Récompenses' },
  { href: `/clubs/${id}/joueurs`, label: 'Joueurs' },
  { href: `/clubs/${id}/defis`, label: 'Défis' },
  { href: `/clubs/${id}/avantages`, label: 'Avantages par niveau' },
  { href: `/clubs/${id}/parametres`, label: 'Paramètres' },
];

/** Mise en page du back-office : menu selon le rôle (admin club : son club ; super admin : tout). */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const me = await getMe();
  if (!me || (me.role !== 'CLUB_ADMIN' && me.role !== 'SUPER_ADMIN')) redirect('/login');

  let groups: NavGroup[];
  if (me.role === 'CLUB_ADMIN') {
    const [club] = await apiGet<Club[]>('/clubs');
    groups = [{ title: club?.name ?? 'Mon club', items: clubItems(me.clubId!) }];
  } else {
    const clubs = await apiGet<Club[]>('/clubs');
    groups = [
      {
        title: 'Groupement GPR',
        items: [
          { href: '/admin', label: 'Vue d’ensemble' },
          { href: '/admin/clubs', label: 'Clubs et connecteurs' },
          { href: '/admin/joueurs', label: 'Joueurs' },
          { href: '/admin/defis', label: 'Défis du groupement' },
          { href: '/admin/badges', label: 'Badges' },
          { href: '/admin/vip', label: 'Carte VIP et partenaires' },
          { href: '/admin/regles', label: 'Règles GPR' },
          { href: '/admin/comptes', label: 'Comptes admin' },
          { href: '/admin/audit', label: 'Journal d’audit' },
        ],
      },
      {
        title: 'Espaces clubs',
        items: clubs.map((c) => ({ href: `/clubs/${c.id}`, label: c.name })),
      },
    ];
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-light.png" alt="GPR – Groupement Padel Référence" />
          <span>Back-office</span>
        </div>
        <Sidebar groups={groups} />
        <div className="sidebar-footer">
          <div className="small">
            {me.firstName} {me.lastName}
          </div>
          <div className="muted small">
            {me.role === 'SUPER_ADMIN' ? 'Super admin GPR' : 'Admin club'}
          </div>
          <form action={logoutAction}>
            <button className="secondary small-btn">Se déconnecter</button>
          </form>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
