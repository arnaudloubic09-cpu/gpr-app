import Link from 'next/link';
import { PlayerDetail, PlayerDetailData } from '@/components/player-detail';
import { PageHeader } from '@/components/ui';
import { apiGet } from '@/lib/api';
import { adjustPoints } from '../actions';

export default async function ClubPlayerPage({
  params,
}: {
  params: Promise<{ clubId: string; userId: string }>;
}) {
  const { clubId, userId } = await params;
  const player = await apiGet<PlayerDetailData & { adjustmentLimit: number | null }>(
    `/clubs/${clubId}/players/${userId}`,
  );
  const name = [player.firstName, player.lastName].filter(Boolean).join(' ') || player.email;
  return (
    <>
      <PageHeader
        title={name}
        subtitle="Fiche joueur"
        actions={<Link href={`/clubs/${clubId}/joueurs`}>← Joueurs</Link>}
      />
      <PlayerDetail
        player={player}
        scopeLabel="dans votre club"
        adjustAction={adjustPoints.bind(
          null,
          `/clubs/${clubId}/players/${userId}`,
          `/clubs/${clubId}/joueurs/${userId}`,
        )}
        adjustmentHint={`Maximum ${player.adjustmentLimit} points GPR par opération dans l’espace club. Au-delà, contactez le GPR.`}
      />
    </>
  );
}
