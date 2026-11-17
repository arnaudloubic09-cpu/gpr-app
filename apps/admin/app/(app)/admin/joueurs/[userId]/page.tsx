import Link from 'next/link';
import { PlayerDetail, PlayerDetailData } from '@/components/player-detail';
import { PageHeader } from '@/components/ui';
import { apiGet } from '@/lib/api';
import { adjustPoints } from '../../../clubs/[clubId]/joueurs/actions';

export default async function AdminPlayerPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const player = await apiGet<PlayerDetailData>(`/admin/players/${userId}`);
  const name = [player.firstName, player.lastName].filter(Boolean).join(' ') || player.email;
  return (
    <>
      <PageHeader
        title={name}
        subtitle="Fiche joueur (vue groupement)"
        actions={<Link href="/admin/joueurs">← Joueurs</Link>}
      />
      <PlayerDetail
        player={player}
        scopeLabel="(tous clubs)"
        adjustAction={adjustPoints.bind(
          null,
          `/admin/players/${userId}`,
          `/admin/joueurs/${userId}`,
        )}
        adjustmentHint="Super admin : pas de plafond. L’ajustement n’est rattaché à aucun club."
      />
    </>
  );
}
