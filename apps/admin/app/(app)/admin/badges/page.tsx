import { revalidatePath } from 'next/cache';
import { ActionForm } from '@/components/action-form';
import { PageHeader } from '@/components/ui';
import { apiGet, apiSend, type ActionResult } from '@/lib/api';

type Badge = {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  awarded: number;
};
const ICONS = [
  'trophy',
  'medal',
  'star',
  'flame',
  'compass',
  'calendar',
  'sunny',
  'moon',
  'flash',
  'ribbon',
  'tennisball',
  'people',
];

async function createBadge(_prev: ActionResult | null, form: FormData) {
  'use server';
  const res = await apiSend('/admin/badges', 'POST', {
    code: String(form.get('code') ?? '').toUpperCase(),
    name: String(form.get('name') ?? ''),
    description: String(form.get('description') ?? ''),
    icon: String(form.get('icon')),
  });
  if (res.ok) revalidatePath('/admin/badges');
  return res;
}

export default async function BadgesPage() {
  const badges = await apiGet<Badge[]>('/admin/badges');
  return (
    <>
      <PageHeader
        title="Badges"
        subtitle="Attribués par les défis ; un joueur ne reçoit chaque badge qu’une seule fois."
      />
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Badge</th>
              <th>Code</th>
              <th>Icône</th>
              <th className="num">Obtenu par</th>
            </tr>
          </thead>
          <tbody>
            {badges.map((b) => (
              <tr key={b.id}>
                <td>
                  <strong>{b.name}</strong>
                  <div className="muted small">{b.description}</div>
                </td>
                <td className="small">{b.code}</td>
                <td className="small">{b.icon}</td>
                <td className="num">{b.awarded} joueur(s)</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Nouveau badge</h2>
      <ActionForm
        action={createBadge}
        submitLabel="Créer le badge"
        successMessage="Badge créé."
        className="card"
      >
        <div className="form-grid">
          <div>
            <label htmlFor="name">Nom</label>
            <input
              id="name"
              name="name"
              required
              minLength={2}
              maxLength={40}
              placeholder="Lève-tôt"
            />
          </div>
          <div>
            <label htmlFor="code">Code</label>
            <input
              id="code"
              name="code"
              required
              pattern="[A-Za-z][A-Za-z0-9_]{1,30}"
              placeholder="EARLY_BIRD"
            />
          </div>
          <div>
            <label htmlFor="icon">Icône</label>
            <select id="icon" name="icon">
              {ICONS.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label htmlFor="description">Description</label>
        <input
          id="description"
          name="description"
          required
          minLength={3}
          maxLength={200}
          placeholder="A joué 5 fois avant 9 h"
        />
      </ActionForm>
    </>
  );
}
