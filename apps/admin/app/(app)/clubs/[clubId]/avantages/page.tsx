import { revalidatePath } from 'next/cache';
import { ActionForm } from '@/components/action-form';
import { Empty, PageHeader } from '@/components/ui';
import { apiGet, apiSend, type ActionResult } from '@/lib/api';
import { CATEGORY_LABELS } from '@/lib/format';

type Perk = {
  id: string;
  levelCode: string;
  category: string;
  discountPercent: number;
  label: string;
  isActive: boolean;
};
type Level = { code: string; label: string; minGpr: number };

function body(form: FormData, isActive: boolean) {
  return {
    levelCode: String(form.get('levelCode')),
    category: String(form.get('category')),
    discountPercent: Number(form.get('discountPercent')),
    label: String(form.get('label') ?? ''),
    isActive,
  };
}

async function createPerk(clubId: string, _prev: ActionResult | null, form: FormData) {
  'use server';
  const res = await apiSend(`/clubs/${clubId}/admin/perks`, 'POST', body(form, true));
  if (res.ok) revalidatePath(`/clubs/${clubId}/avantages`);
  return res;
}

async function togglePerk(clubId: string, perk: Perk, _prev: ActionResult | null) {
  'use server';
  const { id: _id, ...rest } = perk;
  const res = await apiSend(`/clubs/${clubId}/admin/perks/${perk.id}`, 'PATCH', {
    ...rest,
    isActive: !perk.isActive,
  });
  if (res.ok) revalidatePath(`/clubs/${clubId}/avantages`);
  return res;
}

export default async function PerksPage({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params;
  const [perks, levels] = await Promise.all([
    apiGet<Perk[]>(`/clubs/${clubId}/admin/perks`),
    apiGet<Level[]>('/levels'),
  ]);
  const sorted = [...levels].sort((a, b) => a.minGpr - b.minGpr);
  const levelLabel = (code: string) => levels.find((l) => l.code === code)?.label ?? code;
  return (
    <>
      <PageHeader
        title="Avantages par niveau"
        subtitle="Réductions permanentes pour vos membres selon leur niveau, sur présentation de leur carte de membre au comptoir."
      />
      <div className="card">
        <p className="muted small">
          Niveaux GPR (points gagnés sur 12 mois) :{' '}
          {sorted.map((l) => `${l.label} ${l.minGpr ? `dès ${l.minGpr}` : ''}`.trim()).join(' · ')}.
          Un membre profite aussi des avantages des niveaux inférieurs ; pour une même catégorie, la
          meilleure réduction s’applique. Jamais de réduction sur une partie ou une réservation de
          terrain.
        </p>
        {perks.length === 0 ? (
          <Empty>Aucun avantage pour le moment.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>À partir du niveau</th>
                  <th>Avantage</th>
                  <th>Catégorie</th>
                  <th className="num">Réduction</th>
                  <th>Statut</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {[...perks]
                  .sort(
                    (a, b) =>
                      sorted.findIndex((l) => l.code === a.levelCode) -
                      sorted.findIndex((l) => l.code === b.levelCode),
                  )
                  .map((p) => (
                    <tr key={p.id}>
                      <td>{levelLabel(p.levelCode)}</td>
                      <td>{p.label}</td>
                      <td>{CATEGORY_LABELS[p.category]}</td>
                      <td className="num">-{p.discountPercent} %</td>
                      <td>
                        {p.isActive ? (
                          <span className="badge badge-ok">Actif</span>
                        ) : (
                          <span className="badge badge-neutral">Inactif</span>
                        )}
                      </td>
                      <td>
                        <ActionForm
                          action={togglePerk.bind(null, clubId, p)}
                          submitLabel={p.isActive ? 'Désactiver' : 'Activer'}
                          variant="secondary"
                          className="inline-form"
                        />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <h2>Nouvel avantage</h2>
      <ActionForm
        action={createPerk.bind(null, clubId)}
        submitLabel="Ajouter l’avantage"
        successMessage="Avantage ajouté."
        className="card"
      >
        <div className="form-grid">
          <div>
            <label htmlFor="levelCode">À partir du niveau</label>
            <select id="levelCode" name="levelCode" defaultValue="GOLD">
              {sorted.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="category">Catégorie</label>
            <select id="category" name="category" defaultValue="EQUIPMENT">
              {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {v === 'EQUIPMENT' ? 'Shop / matériel' : v === 'LESSON' ? 'Cours' : l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="discountPercent">Réduction (%)</label>
            <input
              id="discountPercent"
              name="discountPercent"
              type="number"
              min={1}
              max={50}
              defaultValue={10}
              required
            />
          </div>
          <div>
            <label htmlFor="label">Libellé affiché</label>
            <input
              id="label"
              name="label"
              required
              minLength={3}
              maxLength={80}
              placeholder="-10 % sur le shop du club"
            />
          </div>
        </div>
      </ActionForm>
    </>
  );
}
