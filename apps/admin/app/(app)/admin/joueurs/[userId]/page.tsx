import Link from 'next/link';
import { PlayerDetail, PlayerDetailData } from '@/components/player-detail';
import { PageHeader } from '@/components/ui';
import { apiGet } from '@/lib/api';
import { ActionForm } from '@/components/action-form';
import { Badge } from '@/components/ui';
import { date } from '@/lib/format';
import { adjustPoints } from '../../../clubs/[clubId]/joueurs/actions';
import { grantVip } from '../../vip/actions';

export default async function AdminPlayerPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const [player, memberships] = await Promise.all([
    apiGet<PlayerDetailData>(`/admin/players/${userId}`),
    apiGet<
      { id: string; source: string; startsAt: string; endsAt: string; reason: string | null }[]
    >(`/admin/vip/players/${userId}`),
  ]);
  const now = new Date();
  const SOURCES: Record<string, string> = {
    PLATINUM: 'Niveau Platine',
    PURCHASE: 'Achat',
    MANUAL: 'Attribution manuelle',
  };
  const name = [player.firstName, player.lastName].filter(Boolean).join(' ') || player.email;
  return (
    <>
      <PageHeader
        title={name}
        subtitle="Fiche joueur (vue groupement)"
        actions={<Link href="/admin/joueurs">← Joueurs</Link>}
      />
      <PlayerDetail
        player={player}
        scopeLabel="(tous clubs)"
        adjustAction={adjustPoints.bind(
          null,
          `/admin/players/${userId}`,
          `/admin/joueurs/${userId}`,
        )}
        adjustmentHint="Super admin : pas de plafond. L’ajustement n’est rattaché à aucun club."
      />
      <div className="two-cols">
        <div className="card">
          <h2>Carte VIP</h2>
          {memberships.length === 0 ? (
            <p className="muted">Aucune carte VIP.</p>
          ) : (
            <table>
              <tbody>
                {memberships.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {SOURCES[m.source]}
                      {m.reason ? <div className="muted small">{m.reason}</div> : null}
                    </td>
                    <td className="small">
                      {date(m.startsAt)} → {date(m.endsAt)}
                    </td>
                    <td>
                      {new Date(m.startsAt) <= now && new Date(m.endsAt) > now ? (
                        <Badge tone="ok">En cours</Badge>
                      ) : new Date(m.startsAt) > now ? (
                        <Badge>À venir</Badge>
                      ) : (
                        <Badge>Terminée</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <ActionForm
          action={grantVip.bind(null, userId)}
          submitLabel="Attribuer la carte VIP"
          successMessage="Carte VIP attribuée."
          className="card"
          confirm="Attribuer la carte VIP à ce joueur ?"
        >
          <h2>Attribuer une carte VIP</h2>
          <p className="muted small">
            Cadeau, partenariat ou vente au comptoir en attendant le paiement en ligne. Prolonge la
            carte en cours.
          </p>
          <label htmlFor="vipMonths">Durée (mois)</label>
          <input
            id="vipMonths"
            name="months"
            type="number"
            min={1}
            max={36}
            defaultValue={12}
            required
          />
          <label htmlFor="vipReason">Motif</label>
          <input
            id="vipReason"
            name="reason"
            required
            minLength={5}
            placeholder="Vente au comptoir de Toulouse, 60 €"
          />
        </ActionForm>
      </div>
    </>
  );
}
