import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { PartnerForm } from '@/components/partner-form';
import { Badge, Empty, Kpi, PageHeader } from '@/components/ui';
import { apiGet } from '@/lib/api';
import { n } from '@/lib/format';
import { createPartner, saveVipSettings } from './actions';

type Overview = {
  settings: { enabled: boolean; priceCents: number; purchaseEnabled: boolean };
  activeMembers: Record<string, number>;
  partners: {
    id: string;
    name: string;
    offer: string;
    isActive: boolean;
    maxCodesPerMember: number | null;
    lowStockAlertAt: string | null;
    codes: { total: number; assigned: number; remaining: number };
  }[];
};

export default async function VipPage() {
  const o = await apiGet<Overview>('/admin/vip');
  const members = Object.values(o.activeMembers).reduce((a, b) => a + b, 0);
  return (
    <>
      <PageHeader
        title="Carte VIP et partenaires"
        subtitle="Codes promo de partenaires extérieurs, réservés aux membres VIP."
      />
      <ActionForm
        action={saveVipSettings}
        submitLabel="Enregistrer"
        successMessage="Réglages enregistrés."
        className={`card ${o.settings.enabled ? '' : 'kpi warn'}`}
        confirm={
          o.settings.enabled
            ? undefined
            : 'Si vous activez la carte VIP, elle devient visible pour tous les joueurs et les joueurs Platine la reçoivent immédiatement. Continuer ?'
        }
      >
        <h2>
          Statut :{' '}
          {o.settings.enabled ? (
            <Badge tone="ok">Activée</Badge>
          ) : (
            <Badge tone="warn">Désactivée (invisible pour les joueurs)</Badge>
          )}
        </h2>
        <p className="muted">
          Accès gratuit pendant 1 an pour les joueurs qui atteignent le niveau Platine (renouvelé
          s’ils le sont toujours à l’échéance). Accès payant : achat simple d’un an, renouvelé par
          le joueur.
        </p>
        <div className="form-grid">
          <div>
            <label htmlFor="price">Prix de la carte (€ / an)</label>
            <input
              id="price"
              name="price"
              type="number"
              min={0}
              step={1}
              defaultValue={o.settings.priceCents / 100}
              required
            />
          </div>
          <div>
            <label>Paiement en ligne</label>
            <p className="muted small" style={{ marginTop: 6 }}>
              Pas encore branché : nécessite le compte de paiement (Stripe) du GPR et les conditions
              générales de vente. En attendant, attribuez la carte depuis la fiche du joueur
              (cadeau, vente au comptoir).
            </p>
          </div>
        </div>
        <label className="checkbox">
          <input type="checkbox" name="enabled" defaultChecked={o.settings.enabled} /> Activer la
          carte VIP pour les joueurs
        </label>
      </ActionForm>

      <div className="grid">
        <Kpi label="Membres VIP actifs" value={n(members)} />
        <Kpi label="Via le niveau Platine" value={n(o.activeMembers.PLATINUM ?? 0)} />
        <Kpi label="Achetées" value={n(o.activeMembers.PURCHASE ?? 0)} />
        <Kpi label="Attribuées à la main" value={n(o.activeMembers.MANUAL ?? 0)} />
      </div>

      <div className="card table-wrap">
        <h2>Partenaires</h2>
        {o.partners.length === 0 ? (
          <Empty>Aucun partenaire pour le moment.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Partenaire</th>
                <th>Offre</th>
                <th className="num">Codes restants</th>
                <th className="num">Codes distribués</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {o.partners.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/admin/vip/${p.id}`}>
                      <strong>{p.name}</strong>
                    </Link>
                  </td>
                  <td>{p.offer}</td>
                  <td className="num">
                    {p.codes.remaining < 20 ? (
                      <Badge tone={p.codes.remaining === 0 ? 'danger' : 'warn'}>
                        {n(p.codes.remaining)}
                      </Badge>
                    ) : (
                      n(p.codes.remaining)
                    )}
                  </td>
                  <td className="num">{n(p.codes.assigned)}</td>
                  <td>{p.isActive ? <Badge tone="ok">Visible</Badge> : <Badge>Masqué</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <h2>Nouveau partenaire</h2>
      <PartnerForm action={createPartner} />
    </>
  );
}
