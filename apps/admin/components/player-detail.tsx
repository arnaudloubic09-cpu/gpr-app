import { ActionForm } from '@/components/action-form';
import { Badge, Empty, Kpi } from '@/components/ui';
import type { ActionResult } from '@/lib/api';
import { COUPON_LABELS, date, dateTime, LEDGER_LABELS, n, PROVIDER_LABELS } from '@/lib/format';

export type PlayerDetailData = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone?: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  favoriteClub: { name: string } | null;
  externalLinks: { provider: string; linkedAt: string }[];
  balance: {
    available: number;
    pending: number;
    expiringSoon: number;
    /** Super admin : solde de chaque club. */
    clubs?: { club: { id: string; name: string }; available: number; pending: number }[];
  };
  transactions: {
    id: string;
    type: string;
    amount: number;
    reason: string | null;
    club: { name: string } | null;
    earnedAt: string;
  }[];
  coupons: {
    id: string;
    code: string;
    status: string;
    costGpr: number;
    createdAt: string;
    reward: { title: string };
    club: { name: string };
  }[];
};

/** Fiche joueur partagée par l'espace club (historique du club) et l'espace super admin (tout). */
export function PlayerDetail({
  player,
  scopeLabel,
  adjustAction,
  adjustmentHint,
  clubChoices,
}: {
  player: PlayerDetailData;
  scopeLabel: string;
  adjustAction: (prev: ActionResult | null, form: FormData) => Promise<ActionResult | null>;
  adjustmentHint: string;
  /** Super admin : liste des clubs pour choisir le solde ajusté. */
  clubChoices?: { id: string; name: string }[];
}) {
  return (
    <>
      <div className="grid">
        <Kpi
          label={
            player.balance.clubs
              ? 'Solde disponible (total des clubs)'
              : 'Solde utilisable dans votre club'
          }
          value={n(player.balance.available)}
        />
        <Kpi label="En attente" value={n(player.balance.pending)} />
        <Kpi
          label="Expirent sous 30 jours"
          value={n(player.balance.expiringSoon)}
          tone={player.balance.expiringSoon ? 'warn' : undefined}
        />
      </div>
      {player.balance.clubs ? (
        <div className="card table-wrap">
          <h2>Solde par club</h2>
          <p className="muted small">
            Les points ne sont utilisables que dans le club où ils ont été gagnés.
          </p>
          {player.balance.clubs.length === 0 ? (
            <Empty>Aucun point pour le moment.</Empty>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Club</th>
                  <th className="num">Disponibles</th>
                  <th className="num">En attente</th>
                </tr>
              </thead>
              <tbody>
                {player.balance.clubs.map((c) => (
                  <tr key={c.club.id}>
                    <td>{c.club.name}</td>
                    <td className="num">{n(c.available)}</td>
                    <td className="num">{n(c.pending)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
      <div className="two-cols">
        <div className="card">
          <h2>Profil</h2>
          <table>
            <tbody>
              <tr>
                <td className="muted">Email</td>
                <td>{player.email}</td>
              </tr>
              {player.phone !== undefined ? (
                <tr>
                  <td className="muted">Téléphone</td>
                  <td>{player.phone ?? '—'}</td>
                </tr>
              ) : null}
              <tr>
                <td className="muted">Club principal</td>
                <td>{player.favoriteClub?.name ?? '—'}</td>
              </tr>
              <tr>
                <td className="muted">Inscrit le</td>
                <td>{date(player.createdAt)}</td>
              </tr>
              <tr>
                <td className="muted">Dernière activité</td>
                <td>{dateTime(player.lastLoginAt)}</td>
              </tr>
              <tr>
                <td className="muted">Comptes liés</td>
                <td>
                  {player.externalLinks.length ? (
                    player.externalLinks
                      .map(
                        (l) => `${PROVIDER_LABELS[l.provider] ?? l.provider} (${date(l.linkedAt)})`,
                      )
                      .join(', ')
                  ) : (
                    <Badge tone="warn">Aucun : pas de points sur ses parties</Badge>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2>Ajustement manuel</h2>
          <ActionForm
            action={adjustAction}
            submitLabel="Enregistrer l’ajustement"
            successMessage="Ajustement enregistré."
            confirm="Confirmer cet ajustement de points GPR ?"
          >
            {clubChoices ? (
              <>
                <label htmlFor="adjustClub">Club dont le solde est ajusté</label>
                <select id="adjustClub" name="clubId" required defaultValue="">
                  <option value="" disabled>
                    Choisir un club…
                  </option>
                  {clubChoices.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
            <div className="form-grid">
              <div>
                <label htmlFor="direction">Opération</label>
                <select id="direction" name="direction">
                  <option value="add">Ajouter des points</option>
                  <option value="remove">Retirer des points</option>
                </select>
              </div>
              <div>
                <label htmlFor="amount">Points GPR</label>
                <input id="amount" name="amount" type="number" min={1} step={1} required />
              </div>
            </div>
            <label htmlFor="reason">Motif (obligatoire, visible dans le journal d’audit)</label>
            <input
              id="reason"
              name="reason"
              required
              minLength={5}
              maxLength={300}
              placeholder="Ex. partie non synchronisée le 12/11"
            />
            <div className="hint">{adjustmentHint}</div>
          </ActionForm>
        </div>
      </div>
      <div className="card table-wrap">
        <h2>Historique des points {scopeLabel}</h2>
        {player.transactions.length === 0 ? (
          <Empty>Aucune transaction.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Opération</th>
                <th>Club</th>
                <th>Motif</th>
                <th className="num">Points GPR</th>
              </tr>
            </thead>
            <tbody>
              {player.transactions.map((t) => (
                <tr key={t.id}>
                  <td className="small">{dateTime(t.earnedAt)}</td>
                  <td>{LEDGER_LABELS[t.type] ?? t.type}</td>
                  <td>{t.club?.name ?? '—'}</td>
                  <td className="small">{t.reason ?? ''}</td>
                  <td className={`num ${t.amount > 0 ? 'pos' : 'neg'}`}>
                    {t.amount > 0 ? '+' : ''}
                    {n(t.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="card table-wrap">
        <h2>Coupons {scopeLabel}</h2>
        {player.coupons.length === 0 ? (
          <Empty>Aucun coupon.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Récompense</th>
                <th>Club</th>
                <th>Code</th>
                <th>Statut</th>
                <th className="num">Coût</th>
              </tr>
            </thead>
            <tbody>
              {player.coupons.map((c) => (
                <tr key={c.id}>
                  <td className="small">{dateTime(c.createdAt)}</td>
                  <td>{c.reward.title}</td>
                  <td>{c.club.name}</td>
                  <td className="small">{c.code}</td>
                  <td>
                    <Badge
                      tone={c.status === 'USED' ? 'ok' : c.status === 'ACTIVE' ? 'warn' : 'neutral'}
                    >
                      {COUPON_LABELS[c.status]}
                    </Badge>
                  </td>
                  <td className="num">{n(c.costGpr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
