import { ActionForm } from '@/components/action-form';
import { PageHeader } from '@/components/ui';
import { apiGet } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { saveRules } from './actions';

type Rules = {
  version: number;
  pointsPerSlot: number;
  slotMinutes: number;
  pendingDelayMinutes: number;
  expirationMonths: number;
  dailyMaxMinutes: number | null;
  couponValidityDays: number;
  clubAdjustmentMax: number;
  offPeakMultiplier: number | string;
  offPeakWindows: { days: number[]; start: string; end: string }[];
  levels: unknown[];
  createdAt?: string;
};

export default async function RulesPage() {
  const { active, history } = await apiGet<{ active: Rules; history: Rules[] }>('/admin/rules');
  const w = active.offPeakWindows;
  return (
    <>
      <PageHeader
        title="Règles GPR"
        subtitle={`Version active : v${active.version}. Communes à tous les clubs du groupement.`}
      />
      <ActionForm
        action={saveRules.bind(null, active.levels)}
        submitLabel="Publier une nouvelle version"
        successMessage="Nouvelle version publiée : elle s’applique aux prochaines synchronisations."
        confirm="Publier ces règles pour tous les clubs ?"
        className="card"
      >
        <h2>Gain de points</h2>
        <div className="form-grid">
          <div>
            <label htmlFor="pointsPerSlot">Points GPR par tranche</label>
            <input
              id="pointsPerSlot"
              name="pointsPerSlot"
              type="number"
              min={1}
              defaultValue={active.pointsPerSlot}
              required
            />
          </div>
          <div>
            <label htmlFor="slotMinutes">Durée d’une tranche (min)</label>
            <input
              id="slotMinutes"
              name="slotMinutes"
              type="number"
              min={5}
              defaultValue={active.slotMinutes}
              required
            />
            <div className="hint">Calcul au prorata du temps joué.</div>
          </div>
          <div>
            <label htmlFor="pendingDelayHours">Délai de validation (heures après la partie)</label>
            <input
              id="pendingDelayHours"
              name="pendingDelayHours"
              type="number"
              min={0}
              max={168}
              defaultValue={active.pendingDelayMinutes / 60}
              required
            />
          </div>
          <div>
            <label htmlFor="expirationMonths">Expiration des points (mois)</label>
            <input
              id="expirationMonths"
              name="expirationMonths"
              type="number"
              min={1}
              max={60}
              defaultValue={active.expirationMonths}
              required
            />
          </div>
          <div>
            <label htmlFor="dailyMaxMinutes">Temps de jeu crédité max. par jour (minutes)</label>
            <input
              id="dailyMaxMinutes"
              name="dailyMaxMinutes"
              type="number"
              min={30}
              max={1440}
              step={15}
              defaultValue={active.dailyMaxMinutes ?? ''}
              placeholder="Illimité"
            />
            <div className="hint">
              Anti-abus, par joueur et tous clubs confondus. Les parties simultanées ne comptent
              qu’une fois.
            </div>
          </div>
        </div>
        <h2 style={{ marginTop: 24 }}>Heures creuses (lundi au vendredi)</h2>
        <div className="form-grid">
          <div>
            <label htmlFor="offPeakMultiplier">Multiplicateur</label>
            <input
              id="offPeakMultiplier"
              name="offPeakMultiplier"
              type="number"
              min={1}
              max={5}
              step={0.1}
              defaultValue={Number(active.offPeakMultiplier)}
              required
            />
          </div>
          <div>
            <label htmlFor="w1start">Plage 1 : début</label>
            <input id="w1start" name="w1start" type="time" defaultValue={w[0]?.start} />
          </div>
          <div>
            <label htmlFor="w1end">Plage 1 : fin</label>
            <input id="w1end" name="w1end" type="time" defaultValue={w[0]?.end} />
          </div>
          <div>
            <label htmlFor="w2start">Plage 2 : début</label>
            <input id="w2start" name="w2start" type="time" defaultValue={w[1]?.start} />
          </div>
          <div>
            <label htmlFor="w2end">Plage 2 : fin</label>
            <input id="w2end" name="w2end" type="time" defaultValue={w[1]?.end} />
          </div>
        </div>
        <p className="hint">Chaque club choisit d’activer ou non le bonus dans ses paramètres.</p>
        <h2 style={{ marginTop: 24 }}>Coupons et ajustements</h2>
        <div className="form-grid">
          <div>
            <label htmlFor="couponValidityDays">Validité d’un coupon (jours)</label>
            <input
              id="couponValidityDays"
              name="couponValidityDays"
              type="number"
              min={1}
              max={365}
              defaultValue={active.couponValidityDays}
              required
            />
          </div>
          <div>
            <label htmlFor="clubAdjustmentMax">Ajustement max. par un admin club</label>
            <input
              id="clubAdjustmentMax"
              name="clubAdjustmentMax"
              type="number"
              min={0}
              defaultValue={active.clubAdjustmentMax}
              required
            />
          </div>
        </div>
        <p className="hint">Plafond journalier de points : désactivé (choix du GPR).</p>
      </ActionForm>
      <div className="card table-wrap">
        <h2>Historique des versions</h2>
        <table>
          <thead>
            <tr>
              <th>Version</th>
              <th>Publiée le</th>
              <th>Barème</th>
              <th>Heures creuses</th>
              <th>Expiration</th>
              <th>Coupon</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.version}>
                <td>
                  v{h.version}
                  {h.version === active.version ? ' (active)' : ''}
                </td>
                <td className="small">{dateTime(h.createdAt)}</td>
                <td>
                  {h.pointsPerSlot} / {h.slotMinutes} min
                </td>
                <td>
                  ×{Number(h.offPeakMultiplier)} ·{' '}
                  {h.offPeakWindows.map((x) => `${x.start}–${x.end}`).join(', ')}
                </td>
                <td>{h.expirationMonths} mois</td>
                <td>{h.couponValidityDays} j</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
