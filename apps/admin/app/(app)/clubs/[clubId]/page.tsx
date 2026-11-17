import { Badge, Empty, Kpi, PageHeader, PeriodPicker } from '@/components/ui';
import { apiGet } from '@/lib/api';
import { n } from '@/lib/format';

type Stats = {
  periodDays: number;
  activePlayers: number;
  points: { distributed: number; offPeakBonus: number; redeemed: number; adjusted: number };
  bookings: Record<string, number>;
  coupons: Record<string, number> & { validated: number };
  topRewards: { rewardId: string; title: string; count: number }[];
  series: { day: string; distributed: number; redeemed: number }[];
};
type Club = { id: string; name: string; city: string; offPeakBonusEnabled: boolean };

export default async function ClubDashboard({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { clubId } = await params;
  const period = (await searchParams).period ?? '30d';
  const [club, stats] = await Promise.all([
    apiGet<Club>(`/clubs/${clubId}`),
    apiGet<Stats>(`/clubs/${clubId}/stats?period=${period}`),
  ]);
  const played = stats.bookings.COMPLETED ?? 0;
  const cancelled = (stats.bookings.CANCELLED ?? 0) + (stats.bookings.NO_SHOW ?? 0);

  return (
    <>
      <PageHeader
        title={club.name}
        subtitle={`Tableau de bord · ${club.city}`}
        actions={<PeriodPicker current={period} basePath={`/clubs/${clubId}`} />}
      />
      <div className="grid">
        <Kpi
          label="Joueurs actifs"
          value={n(stats.activePlayers)}
          hint="ont gagné des points GPR dans le club"
        />
        <Kpi
          label="Points GPR distribués"
          value={n(stats.points.distributed)}
          hint={`dont ${n(stats.points.offPeakBonus)} de bonus heures creuses`}
        />
        <Kpi
          label="Points GPR échangés"
          value={n(stats.points.redeemed)}
          hint="contre des récompenses du club"
        />
        <Kpi
          label="Coupons validés"
          value={n(stats.coupons.validated)}
          hint={`${n(stats.coupons.ACTIVE ?? 0)} en attente d’utilisation`}
        />
      </div>
      <div className="two-cols">
        <div className="card">
          <h2>Récompenses les plus échangées</h2>
          {stats.topRewards.length === 0 ? (
            <Empty>Aucun échange sur la période.</Empty>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Récompense</th>
                  <th className="num">Échanges</th>
                </tr>
              </thead>
              <tbody>
                {stats.topRewards.map((r) => (
                  <tr key={r.rewardId}>
                    <td>{r.title}</td>
                    <td className="num">{n(r.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h2>Activité du club</h2>
          <table>
            <tbody>
              <tr>
                <td>Parties terminées (synchronisées)</td>
                <td className="num">{n(played)}</td>
              </tr>
              <tr>
                <td>Annulations et absences</td>
                <td className="num">{n(cancelled)}</td>
              </tr>
              <tr>
                <td>Coupons expirés (points rendus)</td>
                <td className="num">{n(stats.coupons.EXPIRED ?? 0)}</td>
              </tr>
              <tr>
                <td>Coupons annulés par le joueur</td>
                <td className="num">{n(stats.coupons.CANCELLED ?? 0)}</td>
              </tr>
              <tr>
                <td>Ajustements manuels (net)</td>
                <td className="num">{n(stats.points.adjusted)}</td>
              </tr>
              <tr>
                <td>Bonus heures creuses</td>
                <td className="num">
                  {club.offPeakBonusEnabled ? (
                    <Badge tone="ok">Activé</Badge>
                  ) : (
                    <Badge>Désactivé</Badge>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
