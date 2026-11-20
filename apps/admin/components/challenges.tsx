'use client';

import { useState } from 'react';
import { ActionForm } from '@/components/action-form';
import type { ActionResult } from '@/lib/api';

export type ChallengeRow = {
  id: string;
  name: string;
  description: string;
  period: 'WEEK' | 'MONTH' | 'FIXED';
  startsAt: string;
  endsAt: string | null;
  condition: Record<string, unknown> & { type: string; target?: number };
  rewardGpr: number | null;
  rewardBadge: { id: string; name: string } | null;
  isActive: boolean;
  objective: string;
  participants: number;
  completions: number;
};
type Badge = { id: string; name: string };
type Action = (prev: ActionResult | null, form: FormData) => Promise<ActionResult | null>;

const TEMPLATES = [
  {
    type: 'COUNT',
    label: 'Nombre de parties',
    target: 3,
    hint: 'ex. « Jouer 3 fois cette semaine »',
  },
  {
    type: 'MATCH',
    label: 'Créneau précis',
    target: 1,
    hint: 'ex. « Jouer un lundi matin en heures creuses »',
  },
  {
    type: 'MINUTES',
    label: 'Temps de jeu cumulé (minutes)',
    target: 600,
    hint: 'ex. « 10 h de jeu ce mois-ci »',
  },
  {
    type: 'WEEKLY_STREAK',
    label: 'Semaines consécutives',
    target: 4,
    hint: 'au moins une partie par semaine, N semaines d’affilée (dates fixes)',
  },
  {
    type: 'DISTINCT_CLUBS',
    label: 'Clubs différents',
    target: 2,
    hint: 'défis du groupement uniquement',
  },
];
const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const PERIODS = { WEEK: 'Chaque semaine', MONTH: 'Chaque mois', FIXED: 'Dates fixes (une fois)' };

export function ChallengeForm({
  action,
  badges,
  initial,
  scope,
}: {
  action: Action;
  badges: Badge[];
  initial?: ChallengeRow;
  scope: 'club' | 'network';
}) {
  const [type, setType] = useState(initial?.condition.type ?? 'COUNT');
  const template = TEMPLATES.find((t) => t.type === type)!;
  const c: Record<string, unknown> = initial?.condition ?? {};
  const weekdays = (c.weekdays as number[] | undefined) ?? [];
  return (
    <ActionForm
      action={action}
      submitLabel={initial ? 'Enregistrer' : 'Créer le défi'}
      successMessage={initial ? 'Défi enregistré.' : 'Défi créé.'}
      className="card"
    >
      <div className="form-grid">
        <div>
          <label htmlFor="name">Nom du défi</label>
          <input
            id="name"
            name="name"
            required
            minLength={3}
            maxLength={80}
            defaultValue={initial?.name}
            placeholder="Jouer 3 fois cette semaine"
          />
        </div>
        <div>
          <label htmlFor="type">Objectif</label>
          <select id="type" name="type" value={type} onChange={(e) => setType(e.target.value)}>
            {TEMPLATES.filter((t) => scope === 'network' || t.type !== 'DISTINCT_CLUBS').map(
              (t) => (
                <option key={t.type} value={t.type}>
                  {t.label}
                </option>
              ),
            )}
          </select>
          <div className="hint">{template.hint}</div>
        </div>
        <div>
          <label htmlFor="target">Valeur à atteindre</label>
          <input
            id="target"
            name="target"
            type="number"
            min={1}
            required
            defaultValue={(c.target as number | undefined) ?? template.target}
            key={type}
          />
        </div>
        <div>
          <label htmlFor="period">Période</label>
          <select
            id="period"
            name="period"
            defaultValue={initial?.period ?? (type === 'WEEKLY_STREAK' ? 'FIXED' : 'WEEK')}
            key={`p-${type}`}
          >
            {Object.entries(PERIODS).map(([v, l]) => (
              <option key={v} value={v} disabled={type === 'WEEKLY_STREAK' && v !== 'FIXED'}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="startsAt">Début</label>
          <input
            id="startsAt"
            name="startsAt"
            type="date"
            required
            defaultValue={(initial?.startsAt ?? new Date().toISOString()).slice(0, 10)}
          />
        </div>
        <div>
          <label htmlFor="endsAt">Fin (facultatif)</label>
          <input
            id="endsAt"
            name="endsAt"
            type="date"
            defaultValue={initial?.endsAt?.slice(0, 10) ?? ''}
          />
        </div>
      </div>
      {type === 'MATCH' ? (
        <fieldset className="card" style={{ marginTop: 12 }}>
          <legend className="muted small">Créneau</legend>
          <div className="actions">
            {DAYS.map((d, i) => (
              <label key={d} className="checkbox">
                <input
                  type="checkbox"
                  name="weekdays"
                  value={i + 1}
                  defaultChecked={weekdays.includes(i + 1)}
                />{' '}
                {d}
              </label>
            ))}
          </div>
          <div className="form-grid">
            <div>
              <label htmlFor="after">Commence à partir de</label>
              <input id="after" name="after" type="time" defaultValue={(c.after as string) ?? ''} />
            </div>
            <div>
              <label htmlFor="before">Commence avant</label>
              <input
                id="before"
                name="before"
                type="time"
                defaultValue={(c.before as string) ?? ''}
              />
            </div>
          </div>
          <label className="checkbox">
            <input type="checkbox" name="offPeak" defaultChecked={!!c.offPeak} /> Pendant les heures
            creuses du GPR
          </label>
        </fieldset>
      ) : null}
      <label htmlFor="description">Description affichée aux joueurs</label>
      <input
        id="description"
        name="description"
        required
        minLength={3}
        maxLength={300}
        defaultValue={initial?.description}
      />
      <div className="form-grid">
        {scope === 'club' ? (
          <div>
            <label htmlFor="rewardGpr">Récompense : points</label>
            <input
              id="rewardGpr"
              name="rewardGpr"
              type="number"
              min={1}
              defaultValue={initial?.rewardGpr ?? ''}
            />
            <div className="hint">
              Points utilisables dans votre club uniquement. Maximum fixé par le GPR (200 par
              défaut).
            </div>
          </div>
        ) : (
          <div>
            <label>Récompense</label>
            <p className="hint" style={{ marginTop: 6 }}>
              Les défis du GPR rapportent un badge (les points sont propres à chaque club).
            </p>
          </div>
        )}
        <div>
          <label htmlFor="rewardBadgeId">Récompense : badge</label>
          <select
            id="rewardBadgeId"
            name="rewardBadgeId"
            defaultValue={initial?.rewardBadge?.id ?? ''}
          >
            <option value="">Aucun</option>
            {badges.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label className="checkbox">
        <input type="checkbox" name="isActive" defaultChecked={initial?.isActive ?? true} /> Défi
        actif
      </label>
    </ActionForm>
  );
}

export function ChallengeTable({
  rows,
  editBase,
  scope = 'club',
}: {
  rows: ChallengeRow[];
  editBase: string;
  scope?: 'club' | 'network';
}) {
  if (!rows.length) return <p className="muted empty">Aucun défi pour le moment.</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>Défi</th>
          <th>Période</th>
          <th>Récompense</th>
          <th className="num">Participants</th>
          <th className="num">Réussites</th>
          <th>Statut</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>
              <strong>{r.name}</strong>
              <div className="muted small">{r.objective}</div>
            </td>
            <td className="small">{PERIODS[r.period]}</td>
            <td className="small">
              {[
                r.rewardGpr && scope === 'club' ? `+${r.rewardGpr} points` : null,
                r.rewardBadge ? `Badge ${r.rewardBadge.name}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </td>
            <td className="num">{r.participants}</td>
            <td className="num">{r.completions}</td>
            <td>
              {r.isActive ? (
                <span className="badge badge-ok">Actif</span>
              ) : (
                <span className="badge badge-neutral">Inactif</span>
              )}
            </td>
            <td>
              <a href={`${editBase}?edit=${r.id}`}>Modifier</a>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
