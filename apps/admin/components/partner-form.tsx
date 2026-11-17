import { ActionForm } from '@/components/action-form';
import type { ActionResult } from '@/lib/api';

export type PartnerValues = {
  name: string;
  offer: string;
  description: string | null;
  websiteUrl: string | null;
  maxCodesPerMember: number | null;
  codeValidityDays: number;
  isActive: boolean;
};

export function PartnerForm({
  action,
  initial,
}: {
  action: (p: ActionResult | null, f: FormData) => Promise<ActionResult | null>;
  initial?: PartnerValues;
}) {
  return (
    <ActionForm
      action={action}
      submitLabel={initial ? 'Enregistrer' : 'Créer le partenaire'}
      successMessage="Partenaire enregistré."
      className="card"
    >
      <div className="form-grid">
        <div>
          <label htmlFor="name">Nom du partenaire</label>
          <input
            id="name"
            name="name"
            required
            minLength={2}
            defaultValue={initial?.name}
            placeholder="Padel Shop en ligne"
          />
        </div>
        <div>
          <label htmlFor="offer">Offre (affichée aux VIP)</label>
          <input
            id="offer"
            name="offer"
            required
            minLength={3}
            maxLength={120}
            defaultValue={initial?.offer}
            placeholder="-15 % sur tout le site"
          />
        </div>
        <div>
          <label htmlFor="websiteUrl">Site web</label>
          <input
            id="websiteUrl"
            name="websiteUrl"
            type="url"
            defaultValue={initial?.websiteUrl ?? ''}
            placeholder="https://…"
          />
        </div>
        <div>
          <label htmlFor="codeValidityDays">Validité d’un code (jours)</label>
          <input
            id="codeValidityDays"
            name="codeValidityDays"
            type="number"
            min={1}
            max={365}
            defaultValue={initial?.codeValidityDays ?? 7}
            required
          />
        </div>
        <div>
          <label htmlFor="maxCodesPerMember">Codes max. par membre</label>
          <input
            id="maxCodesPerMember"
            name="maxCodesPerMember"
            type="number"
            min={1}
            defaultValue={initial?.maxCodesPerMember ?? ''}
            placeholder="Illimité"
          />
          <div className="hint">Laisser vide : autant de codes que le membre le souhaite.</div>
        </div>
      </div>
      <label htmlFor="description">Description (facultatif)</label>
      <input
        id="description"
        name="description"
        maxLength={500}
        defaultValue={initial?.description ?? ''}
        placeholder="Conditions : hors promotions, livraison offerte dès 50 €…"
      />
      <label className="checkbox">
        <input type="checkbox" name="isActive" defaultChecked={initial?.isActive ?? true} />{' '}
        Partenaire visible par les VIP
      </label>
    </ActionForm>
  );
}
