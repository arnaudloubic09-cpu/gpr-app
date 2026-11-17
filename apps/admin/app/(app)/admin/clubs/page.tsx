import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { Badge, PageHeader } from '@/components/ui';
import { apiGet } from '@/lib/api';
import { dateTime, PROVIDER_LABELS } from '@/lib/format';
import { createClub } from './actions';

export type AdminClub = {
  id: string;
  name: string;
  city: string;
  timezone: string;
  isActive: boolean;
  offPeakBonusEnabled: boolean;
  adminsCount: number;
  consecutiveFailures: number;
  connector: null | {
    provider: string;
    externalClubId: string;
    syncIntervalMinutes: number;
    hasCredentials: boolean;
    lastSyncAt: string | null;
    lastSyncStatus: string | null;
    lastSyncError: string | null;
    failureAlertSentAt: string | null;
  };
};

export default async function AdminClubsPage() {
  const clubs = await apiGet<AdminClub[]>('/admin/clubs');
  return (
    <>
      <PageHeader
        title="Clubs et connecteurs"
        subtitle="Fournisseur de réservation, état des synchronisations, administrateurs."
      />
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Club</th>
              <th>Fournisseur</th>
              <th>Dernière synchronisation</th>
              <th className="num">Admins</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {clubs.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link href={`/admin/clubs/${c.id}`}>
                    <strong>{c.name}</strong>
                  </Link>
                  <div className="muted small">{c.city}</div>
                </td>
                <td>
                  {c.connector ? (
                    PROVIDER_LABELS[c.connector.provider]
                  ) : (
                    <Badge tone="warn">À configurer</Badge>
                  )}
                </td>
                <td>
                  {c.connector?.lastSyncStatus === 'FAILED' ? (
                    <>
                      <Badge tone="danger">{c.consecutiveFailures} échec(s) consécutif(s)</Badge>
                      <div className="error small">{c.connector.lastSyncError}</div>
                    </>
                  ) : c.connector?.lastSyncStatus === 'SUCCESS' ? (
                    <Badge tone="ok">OK</Badge>
                  ) : (
                    <Badge>—</Badge>
                  )}
                  <div className="muted small">{dateTime(c.connector?.lastSyncAt)}</div>
                </td>
                <td className="num">{c.adminsCount}</td>
                <td>{c.isActive ? <Badge tone="ok">Actif</Badge> : <Badge>Inactif</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Ajouter un club au groupement</h2>
      <ActionForm action={createClub} submitLabel="Créer le club" className="card">
        <div className="form-grid">
          <div>
            <label htmlFor="name">Nom</label>
            <input id="name" name="name" required minLength={2} />
          </div>
          <div>
            <label htmlFor="city">Ville</label>
            <input id="city" name="city" required minLength={2} />
          </div>
        </div>
      </ActionForm>
    </>
  );
}
