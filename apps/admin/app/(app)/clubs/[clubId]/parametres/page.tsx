import { ActionForm } from '@/components/action-form';
import { PageHeader } from '@/components/ui';
import { apiGet } from '@/lib/api';
import { saveSettings } from './actions';

type Club = { id: string; name: string; offPeakBonusEnabled: boolean };

export default async function SettingsPage({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params;
  const club = await apiGet<Club>(`/clubs/${clubId}`);
  return (
    <>
      <PageHeader title="Paramètres du club" subtitle={club.name} />
      <ActionForm
        action={saveSettings.bind(null, clubId)}
        submitLabel="Enregistrer"
        successMessage="Paramètres enregistrés."
        className="card"
      >
        <h2>Bonus heures creuses</h2>
        <p className="muted">
          Les heures creuses sont définies par le GPR pour tous les clubs : du lundi au vendredi,
          avant 12 h et de 14 h à 17 h. Activées, elles rapportent{' '}
          <strong>2 fois plus de points GPR</strong> aux joueurs de votre club sur ces créneaux.
        </p>
        <label className="checkbox">
          <input
            type="checkbox"
            name="offPeakBonusEnabled"
            defaultChecked={club.offPeakBonusEnabled}
          />{' '}
          Activer le bonus heures creuses dans mon club
        </label>
      </ActionForm>
    </>
  );
}
