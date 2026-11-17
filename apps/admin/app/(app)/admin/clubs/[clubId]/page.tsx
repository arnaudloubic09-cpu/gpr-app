import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm } from '@/components/action-form';
import { Badge, Empty, PageHeader } from '@/components/ui';
import { apiGet } from '@/lib/api';
import { dateTime, PROVIDER_LABELS } from '@/lib/format';
import { saveConnector, triggerSync, updateClub } from '../actions';
import type { AdminClub } from '../page';

type Run = {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  bookingsFetched: number;
  entriesCreated: number;
  error: string | null;
  triggeredById: string | null;
};

export default async function AdminClubPage({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params;
  const [clubs, runs] = await Promise.all([
    apiGet<AdminClub[]>('/admin/clubs'),
    apiGet<Run[]>(`/clubs/${clubId}/sync-runs`),
  ]);
  const club = clubs.find((c) => c.id === clubId);
  if (!club) notFound();
  const c = club.connector;
  return (
    <>
      <PageHeader
        title={club.name}
        subtitle="Configuration du club"
        actions={
          <>
            <Link href={`/clubs/${clubId}`}>Ouvrir l’espace du club →</Link>
          </>
        }
      />
      <div className="two-cols">
        <ActionForm
          action={updateClub.bind(null, clubId)}
          submitLabel="Enregistrer"
          successMessage="Club enregistré."
          className="card"
        >
          <h2>Informations</h2>
          <label htmlFor="name">Nom</label>
          <input id="name" name="name" defaultValue={club.name} required />
          <label htmlFor="city">Ville</label>
          <input id="city" name="city" defaultValue={club.city} required />
          <label htmlFor="timezone">Fuseau horaire</label>
          <input id="timezone" name="timezone" defaultValue={club.timezone} required />
          <label className="checkbox">
            <input type="checkbox" name="isActive" defaultChecked={club.isActive} /> Club actif
            (synchronisation et catalogue visibles)
          </label>
        </ActionForm>
        <ActionForm
          action={saveConnector.bind(null, clubId)}
          submitLabel="Enregistrer le connecteur"
          successMessage="Connecteur enregistré."
          className="card"
        >
          <h2>Connecteur de réservation</h2>
          <label htmlFor="provider">Fournisseur</label>
          <select id="provider" name="provider" defaultValue={c?.provider ?? 'PLAYTOMIC'}>
            {Object.entries(PROVIDER_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <div className="hint">
            Playtomic et Doinsport : branchés en phase 6, à partir de leur documentation officielle.
          </div>
          <label htmlFor="externalClubId">Identifiant du club chez le fournisseur</label>
          <input
            id="externalClubId"
            name="externalClubId"
            defaultValue={c?.externalClubId}
            required
          />
          <label htmlFor="syncIntervalMinutes">Fréquence de synchronisation (minutes)</label>
          <input
            id="syncIntervalMinutes"
            name="syncIntervalMinutes"
            type="number"
            min={5}
            max={1440}
            defaultValue={c?.syncIntervalMinutes ?? 30}
            required
          />
          <label htmlFor="credentials">Identifiants API</label>
          <textarea
            id="credentials"
            name="credentials"
            rows={2}
            placeholder={
              c?.hasCredentials
                ? '•••••• enregistrés (laisser vide pour les conserver)'
                : '{"apiKey": "…"}'
            }
            autoComplete="off"
          />
          <div className="hint">
            Chiffrés à l’enregistrement, jamais réaffichés ni écrits dans le journal.
          </div>
        </ActionForm>
      </div>
      <div className="card table-wrap">
        <div className="page-header" style={{ marginBottom: 8 }}>
          <h2>Synchronisations</h2>
          {c ? (
            <ActionForm
              action={triggerSync.bind(null, clubId)}
              submitLabel="Relancer maintenant"
              successMessage="Synchronisation terminée."
              variant="secondary"
              className="inline-form"
            />
          ) : null}
        </div>
        {c?.failureAlertSentAt ? (
          <p className="error">
            Alerte envoyée aux super admins le {dateTime(c.failureAlertSentAt)} (
            {club.consecutiveFailures} échecs consécutifs).
          </p>
        ) : null}
        {runs.length === 0 ? (
          <Empty>Aucune synchronisation pour le moment.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Début</th>
                <th>Statut</th>
                <th className="num">Réservations lues</th>
                <th className="num">Écritures créées</th>
                <th>Déclenchement</th>
                <th>Erreur</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="small">{dateTime(r.startedAt)}</td>
                  <td>
                    <Badge
                      tone={
                        r.status === 'SUCCESS' ? 'ok' : r.status === 'FAILED' ? 'danger' : 'warn'
                      }
                    >
                      {r.status === 'SUCCESS'
                        ? 'Réussie'
                        : r.status === 'FAILED'
                          ? 'Échec'
                          : 'En cours'}
                    </Badge>
                  </td>
                  <td className="num">{r.bookingsFetched}</td>
                  <td className="num">{r.entriesCreated}</td>
                  <td className="small">{r.triggeredById ? 'Manuel' : 'Automatique'}</td>
                  <td className="small error">{r.error ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
