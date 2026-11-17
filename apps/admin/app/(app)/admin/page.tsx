import Link from 'next/link';
import { Badge, Kpi, PageHeader, PeriodPicker } from '@/components/ui';
import { apiGet } from '@/lib/api';
import { dateTime, n } from '@/lib/format';

type GlobalStats = {
  players: { total: number; new: number; active: number };
  points: {
    distributed: number;
    offPeakBonus: number;
    redeemed: number;
    adjusted: number;
    expired: number;
  };
  perClub: {
    club: { id: string; name: string; isActive: boolean };
    sync: { lastSyncStatus: string | null; lastSyncAt: string | null } | null;
    distributed: number;
    redeemed: number;
    net: number;
  }[];
};

export default async function AdminOverview({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const period = (await searchParams).period ?? '30d';
  const s = await apiGet<GlobalStats>(`/admin/stats?period=${period}`);
  const failing = s.perClub.filter((c) => c.sync?.lastSyncStatus === 'FAILED');
  return (
    <>
      <PageHeader
        title="Vue d’ensemble du groupement"
        actions={<PeriodPicker current={period} basePath="/admin" />}
      />
      {failing.length ? (
        <div className="card kpi danger" role="alert">
          <strong>Synchronisation en échec :</strong> {failing.map((c) => c.club.name).join(', ')}.{' '}
          <Link href="/admin/clubs">Voir les clubs</Link>
        </div>
      ) : null}
      <div className="grid">
        <Kpi
          label="Joueurs inscrits"
          value={n(s.players.total)}
          hint={`+${n(s.players.new)} sur la période`}
        />
        <Kpi label="Joueurs actifs" value={n(s.players.active)} hint="ont joué sur la période" />
        <Kpi
          label="Points GPR distribués"
          value={n(s.points.distributed)}
          hint={`dont ${n(s.points.offPeakBonus)} de bonus heures creuses`}
        />
        <Kpi
          label="Points GPR échangés"
          value={n(s.points.redeemed)}
          hint={`${n(s.points.expired)} expirés · ${n(s.points.adjusted)} ajustés`}
        />
      </div>
      <div className="card table-wrap">
        <h2>Flux de points entre clubs</h2>
        <p className="muted small">
          Le solde de chaque joueur est commun à tout le groupement. « Net » positif : le club
          génère plus de points qu’il n’en absorbe en récompenses ; négatif : ses récompenses sont
          payées avec des points gagnés ailleurs.
        </p>
        <table>
          <thead>
            <tr>
              <th>Club</th>
              <th className="num">Distribués</th>
              <th className="num">Échangés</th>
              <th className="num">Net</th>
              <th>Synchronisation</th>
            </tr>
          </thead>
          <tbody>
            {s.perClub.map((c) => (
              <tr key={c.club.id}>
                <td>
                  <Link href={`/clubs/${c.club.id}`}>{c.club.name}</Link>{' '}
                  {c.club.isActive ? null : <Badge>Inactif</Badge>}
                </td>
                <td className="num">{n(c.distributed)}</td>
                <td className="num">{n(c.redeemed)}</td>
                <td className={`num ${c.net >= 0 ? 'pos' : 'neg'}`}>
                  {c.net > 0 ? '+' : ''}
                  {n(c.net)}
                </td>
                <td>
                  {!c.sync ? (
                    <Badge>Non configurée</Badge>
                  ) : c.sync.lastSyncStatus === 'FAILED' ? (
                    <Badge tone="danger">En échec</Badge>
                  ) : c.sync.lastSyncStatus === 'SUCCESS' ? (
                    <Badge tone="ok">OK</Badge>
                  ) : (
                    <Badge>Jamais lancée</Badge>
                  )}
                  <div className="muted small">{dateTime(c.sync?.lastSyncAt)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
