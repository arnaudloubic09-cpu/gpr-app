import Link from 'next/link';
import { Badge, Empty, PageHeader } from '@/components/ui';
import { apiGet } from '@/lib/api';
import { CATEGORY_LABELS, date, n, rewardValue } from '@/lib/format';
import { saveReward } from './actions';
import { RewardForm } from './reward-form';

type Reward = {
  id: string;
  title: string;
  category: string;
  kind: string;
  discountValue: number | null;
  costGpr: number;
  stock: number | null;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  couponsCount: number;
};

export default async function RewardsPage({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params;
  const rewards = await apiGet<Reward[]>(`/clubs/${clubId}/admin/rewards`);
  return (
    <>
      <PageHeader
        title="Récompenses"
        subtitle="Ce que vos joueurs peuvent obtenir avec leurs points GPR dans votre club."
      />
      <div className="card table-wrap">
        {rewards.length === 0 ? (
          <Empty>Aucune récompense pour le moment : créez la première ci-dessous.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Récompense</th>
                <th>Catégorie</th>
                <th className="num">Coût</th>
                <th className="num">Stock</th>
                <th>Période</th>
                <th className="num">Coupons</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rewards.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.title}</strong>
                    <div className="muted small">{rewardValue(r)}</div>
                  </td>
                  <td>{CATEGORY_LABELS[r.category]}</td>
                  <td className="num">{n(r.costGpr)}</td>
                  <td className="num">{r.stock === null ? '∞' : n(r.stock)}</td>
                  <td className="small">
                    {r.startsAt || r.endsAt
                      ? `${date(r.startsAt)} → ${date(r.endsAt)}`
                      : 'Permanente'}
                  </td>
                  <td className="num">{n(r.couponsCount)}</td>
                  <td>{r.isActive ? <Badge tone="ok">Visible</Badge> : <Badge>Masquée</Badge>}</td>
                  <td>
                    <Link href={`/clubs/${clubId}/recompenses/${r.id}`}>Modifier</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <h2>Nouvelle récompense</h2>
      <RewardForm action={saveReward.bind(null, clubId, null)} />
    </>
  );
}
