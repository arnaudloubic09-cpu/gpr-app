import { Badge, Empty, Kpi, PageHeader } from '@/components/ui';
import { apiGet } from '@/lib/api';
import { n } from '@/lib/format';

type Row = {
  id: string;
  name: string;
  offer: string;
  isActive: boolean;
  club: { id: string; name: string };
  stats: { thisMonth: number; lastMonth: number; total: number };
};

/** Vue GPR : utilisation des avantages chez les partenaires locaux de tous les clubs. */
export default async function LocalPartnersOverview() {
  const rows = await apiGet<Row[]>('/admin/local-partners');
  const sum = (k: keyof Row['stats']) => rows.reduce((s, r) => s + r.stats[k], 0);
  return (
    <>
      <PageHeader
        title="Partenaires locaux"
        subtitle="Utilisations des avantages chez les commerçants partenaires de chaque club (QR code scanné par le partenaire)."
      />
      <div className="grid">
        <Kpi label="Partenaires" value={n(rows.filter((r) => r.isActive).length)} />
        <Kpi label="Utilisations ce mois" value={n(sum('thisMonth'))} />
        <Kpi label="Mois dernier" value={n(sum('lastMonth'))} />
        <Kpi label="Depuis le début" value={n(sum('total'))} />
      </div>
      <div className="card table-wrap">
        {rows.length === 0 ? (
          <Empty>Aucun partenaire local pour le moment.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Club</th>
                <th>Partenaire</th>
                <th>Offre</th>
                <th className="num">Ce mois</th>
                <th className="num">Mois dernier</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <a href={`/clubs/${r.club.id}/partenaires?edit=${r.id}`}>{r.club.name}</a>
                  </td>
                  <td>
                    <strong>{r.name}</strong> {r.isActive ? null : <Badge>Masqué</Badge>}
                  </td>
                  <td>{r.offer}</td>
                  <td className="num">{n(r.stats.thisMonth)}</td>
                  <td className="num">{n(r.stats.lastMonth)}</td>
                  <td className="num">{n(r.stats.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
