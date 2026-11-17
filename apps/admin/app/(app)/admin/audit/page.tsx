import Link from 'next/link';
import { Empty, PageHeader } from '@/components/ui';
import { apiGet } from '@/lib/api';
import { dateTime } from '@/lib/format';

type Entry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  clubId: string | null;
  createdAt: string;
  actorRole: string | null;
  after: unknown;
  actor: { email: string; firstName: string | null; lastName: string | null } | null;
};

const ACTIONS: Record<string, string> = {
  'coupon.validate': 'Coupon validé',
  'reward.create': 'Récompense créée',
  'reward.update': 'Récompense modifiée',
  'player.points.adjust': 'Ajustement de points',
  'club.settings.update': 'Paramètres du club modifiés',
  'club.create': 'Club créé',
  'club.update': 'Club modifié',
  'club.connector.update': 'Connecteur modifié',
  'club.sync.trigger': 'Synchronisation relancée',
  'rules.version.create': 'Nouvelles règles GPR',
  'admin.create': 'Compte admin créé',
  'admin.disable': 'Compte admin désactivé',
  'admin.enable': 'Compte admin réactivé',
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ clubId?: string; cursor?: string }>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams({
    ...(sp.clubId ? { clubId: sp.clubId } : {}),
    ...(sp.cursor ? { cursor: sp.cursor } : {}),
    limit: '50',
  });
  const [page, clubs] = await Promise.all([
    apiGet<{ items: Entry[]; nextCursor: string | null }>(`/admin/audit?${qs}`),
    apiGet<{ id: string; name: string }[]>('/clubs'),
  ]);
  const clubName = (id: string | null) => clubs.find((c) => c.id === id)?.name ?? '—';
  return (
    <>
      <PageHeader title="Journal d’audit" subtitle="Qui a fait quoi. Le journal est immuable." />
      <form className="card inline-form" method="get">
        <select name="clubId" defaultValue={sp.clubId ?? ''} aria-label="Filtrer par club">
          <option value="">Tous les clubs</option>
          {clubs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button>Filtrer</button>
      </form>
      <div className="card table-wrap">
        {page.items.length === 0 ? (
          <Empty>Aucune entrée.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Auteur</th>
                <th>Action</th>
                <th>Club</th>
                <th>Détail</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((e) => (
                <tr key={e.id}>
                  <td className="small">{dateTime(e.createdAt)}</td>
                  <td>
                    {e.actor
                      ? `${e.actor.firstName ?? ''} ${e.actor.lastName ?? ''}`.trim() ||
                        e.actor.email
                      : 'Système'}
                    <div className="muted small">
                      {e.actorRole === 'SUPER_ADMIN'
                        ? 'Super admin'
                        : e.actorRole === 'CLUB_ADMIN'
                          ? 'Admin club'
                          : ''}
                    </div>
                  </td>
                  <td>{ACTIONS[e.action] ?? e.action}</td>
                  <td>{clubName(e.clubId)}</td>
                  <td className="small">
                    <code>{e.after ? JSON.stringify(e.after).slice(0, 140) : ''}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {page.nextCursor ? (
          <p>
            <Link
              href={`/admin/audit?${new URLSearchParams({ ...(sp.clubId ? { clubId: sp.clubId } : {}), cursor: page.nextCursor })}`}
            >
              Entrées plus anciennes →
            </Link>
          </p>
        ) : null}
      </div>
    </>
  );
}
