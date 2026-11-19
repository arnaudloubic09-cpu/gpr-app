import { revalidatePath } from 'next/cache';
import { ActionForm } from '@/components/action-form';
import { Badge, Empty, PageHeader } from '@/components/ui';
import { apiGet, apiSend, type ActionResult } from '@/lib/api';
import { dateTime, fromParisInput, n, toParisInput } from '@/lib/format';

type Announcement = {
  id: string;
  title: string;
  body: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  stats: { players: number; views: number };
};

async function save(clubId: string, id: string | null, _prev: ActionResult | null, form: FormData) {
  'use server';
  const body = {
    title: String(form.get('title') ?? ''),
    body: String(form.get('body') ?? ''),
    startsAt: fromParisInput(String(form.get('startsAt'))),
    endsAt: fromParisInput(String(form.get('endsAt'))),
    isActive: form.get('isActive') === 'on',
  };
  const res = id
    ? await apiSend(`/clubs/${clubId}/admin/announcements/${id}`, 'PATCH', body)
    : await apiSend(`/clubs/${clubId}/admin/announcements`, 'POST', body);
  if (res.ok) revalidatePath(`/clubs/${clubId}/info`);
  return res;
}

function status(a: Announcement) {
  const now = Date.now();
  if (!a.isActive) return <Badge>Masquée</Badge>;
  if (new Date(a.endsAt).getTime() <= now) return <Badge>Terminée</Badge>;
  if (new Date(a.startsAt).getTime() > now) return <Badge tone="warn">Programmée</Badge>;
  return <Badge tone="ok">En ligne</Badge>;
}

export default async function InfoPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { clubId } = await params;
  const { edit } = await searchParams;
  const list = await apiGet<Announcement[]>(`/clubs/${clubId}/admin/announcements`);
  const editing = list.find((a) => a.id === edit);
  const now = new Date();
  return (
    <>
      <PageHeader
        title="Info du moment"
        subtitle="Un message court affiché en haut de l’accueil de l’app, pour les joueurs dont votre club est le club principal."
      />
      <div className="card table-wrap">
        {list.length === 0 ? (
          <Empty>Aucune info publiée pour le moment.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Info</th>
                <th>Période</th>
                <th>Statut</th>
                <th className="num">Joueurs</th>
                <th className="num">Affichages</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id}>
                  <td>
                    <strong>{a.title}</strong>
                    <div className="muted small">{a.body}</div>
                  </td>
                  <td className="small">
                    {dateTime(a.startsAt)} → {dateTime(a.endsAt)}
                  </td>
                  <td>{status(a)}</td>
                  <td className="num">{n(a.stats.players)}</td>
                  <td className="num">{n(a.stats.views)}</td>
                  <td>
                    <a href={`/clubs/${clubId}/info?edit=${a.id}`}>Modifier</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted small">
          Une seule info est affichée à la fois : la plus récente parmi celles en cours.
        </p>
      </div>
      <h2>{editing ? 'Modifier l’info' : 'Nouvelle info'}</h2>
      <ActionForm
        key={editing?.id ?? 'new'}
        action={save.bind(null, clubId, editing?.id ?? null)}
        submitLabel={editing ? 'Enregistrer' : 'Publier'}
        successMessage="Info enregistrée."
        className="card"
      >
        <label htmlFor="title">Titre (60 caractères max.)</label>
        <input
          id="title"
          name="title"
          required
          minLength={3}
          maxLength={60}
          defaultValue={editing?.title}
          placeholder="Tournoi P100 samedi 30 novembre"
        />
        <label htmlFor="body">Texte (240 caractères max.)</label>
        <textarea
          id="body"
          name="body"
          required
          minLength={3}
          maxLength={240}
          rows={3}
          defaultValue={editing?.body}
          placeholder="Inscriptions ouvertes à l’accueil jusqu’à jeudi. Nombreux lots offerts par notre partenaire !"
        />
        <div className="form-grid">
          <div>
            <label htmlFor="startsAt">Début</label>
            <input
              id="startsAt"
              name="startsAt"
              type="datetime-local"
              required
              defaultValue={toParisInput(editing ? new Date(editing.startsAt) : now)}
            />
          </div>
          <div>
            <label htmlFor="endsAt">Fin</label>
            <input
              id="endsAt"
              name="endsAt"
              type="datetime-local"
              required
              defaultValue={toParisInput(
                editing ? new Date(editing.endsAt) : new Date(now.getTime() + 7 * 86_400_000),
              )}
            />
          </div>
        </div>
        <label className="checkbox">
          <input type="checkbox" name="isActive" defaultChecked={editing?.isActive ?? true} />{' '}
          Visible dans l’application
        </label>
      </ActionForm>
    </>
  );
}
