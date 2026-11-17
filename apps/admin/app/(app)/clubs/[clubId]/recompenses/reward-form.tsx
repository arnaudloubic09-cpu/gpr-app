'use client';

import { useState } from 'react';
import { ActionForm } from '@/components/action-form';
import type { ActionResult } from '@/lib/api';
import { CATEGORY_LABELS, KIND_LABELS } from '@/lib/format';

export type RewardFormValues = {
  category: string;
  kind: string;
  title: string;
  description: string | null;
  costGpr: number;
  discountValue: number | null;
  stock: number | null;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
};

const toInputDate = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

export function RewardForm({
  action,
  initial,
}: {
  action: (prev: ActionResult | null, form: FormData) => Promise<ActionResult | null>;
  initial?: RewardFormValues;
}) {
  const [category, setCategory] = useState(initial?.category ?? 'DRINK');
  const [kind, setKind] = useState(initial?.kind ?? 'FREE_ITEM');
  const discountDefault =
    initial?.discountValue == null
      ? ''
      : initial.kind === 'DISCOUNT_AMOUNT'
        ? initial.discountValue / 100
        : initial.discountValue;

  return (
    <ActionForm
      action={action}
      submitLabel={initial ? 'Enregistrer les modifications' : 'Créer la récompense'}
      className="card"
    >
      <div className="form-grid">
        <div>
          <label htmlFor="title">Intitulé</label>
          <input
            id="title"
            name="title"
            required
            minLength={3}
            maxLength={80}
            defaultValue={initial?.title}
            placeholder="Bière pression offerte"
          />
        </div>
        <div>
          <label htmlFor="category">Catégorie</label>
          <select
            id="category"
            name="category"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              if (e.target.value === 'LESSON' && kind === 'FREE_ITEM') setKind('DISCOUNT_PERCENT');
            }}
          >
            {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <div className="hint">
            Aucune récompense ne peut porter sur une partie ou une réservation de terrain.
          </div>
        </div>
        <div>
          <label htmlFor="kind">Type</label>
          <select id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(KIND_LABELS).map(([v, l]) => (
              <option key={v} value={v} disabled={category === 'LESSON' && v === 'FREE_ITEM'}>
                {l}
              </option>
            ))}
          </select>
        </div>
        {kind !== 'FREE_ITEM' ? (
          <div>
            <label htmlFor="discountValue">
              {kind === 'DISCOUNT_PERCENT' ? 'Réduction (%)' : 'Réduction (€)'}
            </label>
            <input
              id="discountValue"
              name="discountValue"
              type="number"
              min={kind === 'DISCOUNT_PERCENT' ? 1 : 0.5}
              max={kind === 'DISCOUNT_PERCENT' ? 100 : undefined}
              step={kind === 'DISCOUNT_PERCENT' ? 1 : 0.5}
              required
              defaultValue={discountDefault}
            />
          </div>
        ) : null}
        <div>
          <label htmlFor="costGpr">Coût en points GPR</label>
          <input
            id="costGpr"
            name="costGpr"
            type="number"
            min={1}
            step={1}
            required
            defaultValue={initial?.costGpr}
          />
          <div className="hint">Repère : une partie de 90 min rapporte 30 points GPR.</div>
        </div>
        <div>
          <label htmlFor="stock">Stock</label>
          <input
            id="stock"
            name="stock"
            type="number"
            min={0}
            step={1}
            defaultValue={initial?.stock ?? ''}
            placeholder="Illimité"
          />
        </div>
        <div>
          <label htmlFor="startsAt">Début (facultatif)</label>
          <input
            id="startsAt"
            name="startsAt"
            type="date"
            defaultValue={toInputDate(initial?.startsAt ?? null)}
          />
        </div>
        <div>
          <label htmlFor="endsAt">Fin (facultatif)</label>
          <input
            id="endsAt"
            name="endsAt"
            type="date"
            defaultValue={toInputDate(initial?.endsAt ?? null)}
          />
        </div>
      </div>
      <label htmlFor="description">Description (facultatif)</label>
      <textarea
        id="description"
        name="description"
        rows={2}
        maxLength={500}
        defaultValue={initial?.description ?? ''}
      />
      <label className="checkbox">
        <input type="checkbox" name="isActive" defaultChecked={initial?.isActive ?? true} /> Visible
        dans l’application
      </label>
    </ActionForm>
  );
}
