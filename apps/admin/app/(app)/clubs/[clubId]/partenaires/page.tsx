import { ActionForm } from '@/components/action-form';
import { Badge, Empty, PageHeader } from '@/components/ui';
import { apiGet } from '@/lib/api';
import { savePartner } from './actions';

type Partner = {
  id: string;
  name: string;
  offer: string;
  description: string | null;
  address: string;
  mapsUrl: string;
  logoUrl: string | null;
  isActive: boolean;
};

export default async function LocalPartnersPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { clubId } = await params;
  const { edit } = await searchParams;
  const list = await apiGet<Partner[]>(`/clubs/${clubId}/admin/local-partners`);
  const editing = list.find((p) => p.id === edit);
  return (
    <>
      <PageHeader
        title="Partenaires locaux"
        subtitle="Commerces partenaires de votre club. L’avantage est actif pour les joueurs ayant joué dans votre club au cours des 30 derniers jours, sur présentation de l’app."
      />
      <div className="card table-wrap">
        {list.length === 0 ? (
          <Empty>Aucun partenaire local pour le moment.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Partenaire</th>
                <th>Offre</th>
                <th>Adresse</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <td style={{ width: 56 }}>
                    {p.logoUrl ? (
                      <img
                        src={`/media${p.logoUrl}`}
                        alt=""
                        width={44}
                        height={44}
                        style={{
                          objectFit: 'contain',
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                        }}
                      />
                    ) : null}
                  </td>
                  <td>
                    <strong>{p.name}</strong>
                    {p.description ? <div className="muted small">{p.description}</div> : null}
                  </td>
                  <td>{p.offer}</td>
                  <td className="small">
                    <a href={p.mapsUrl} target="_blank" rel="noreferrer">
                      {p.address}
                    </a>
                  </td>
                  <td>{p.isActive ? <Badge tone="ok">Visible</Badge> : <Badge>Masqué</Badge>}</td>
                  <td>
                    <a href={`/clubs/${clubId}/partenaires?edit=${p.id}`}>Modifier</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <h2>{editing ? `Modifier « ${editing.name} »` : 'Nouveau partenaire'}</h2>
      <ActionForm
        key={editing?.id ?? 'new'}
        action={savePartner.bind(null, clubId, editing?.id ?? null)}
        submitLabel={editing ? 'Enregistrer' : 'Ajouter le partenaire'}
        successMessage="Partenaire enregistré."
        className="card"
      >
        <div className="form-grid">
          <div>
            <label htmlFor="name">Enseigne</label>
            <input
              id="name"
              name="name"
              required
              minLength={2}
              maxLength={80}
              defaultValue={editing?.name}
              placeholder="Le Bistrot du Padel"
            />
          </div>
          <div>
            <label htmlFor="offer">Avantage</label>
            <input
              id="offer"
              name="offer"
              required
              minLength={3}
              maxLength={120}
              defaultValue={editing?.offer}
              placeholder="-10 % sur l’addition"
            />
          </div>
        </div>
        <label htmlFor="address">Adresse (pour l’itinéraire)</label>
        <input
          id="address"
          name="address"
          required
          minLength={5}
          maxLength={200}
          defaultValue={editing?.address}
          placeholder="12 rue des Lilas, 31000 Toulouse"
        />
        <label htmlFor="description">Précisions (facultatif)</label>
        <input
          id="description"
          name="description"
          maxLength={300}
          defaultValue={editing?.description ?? ''}
          placeholder="Hors menu du jour, du lundi au vendredi"
        />
        <label htmlFor="logo">Logo (PNG, JPEG ou WebP, 300 Ko max.)</label>
        <input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" />
        {editing?.logoUrl ? (
          <label className="checkbox">
            <input type="checkbox" name="removeLogo" /> Supprimer le logo actuel
          </label>
        ) : null}
        <label className="checkbox">
          <input type="checkbox" name="isActive" defaultChecked={editing?.isActive ?? true} />{' '}
          Visible dans l’application
        </label>
      </ActionForm>
    </>
  );
}
