import { PlayerList, PlayerRow } from '@/components/player-list';
import { PageHeader } from '@/components/ui';
import { apiGet } from '@/lib/api';

export default async function ClubPlayersPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ search?: string }>;
}) {
  const { clubId } = await params;
  const { search } = await searchParams;
  const players = await apiGet<PlayerRow[]>(
    `/clubs/${clubId}/players${search ? `?search=${encodeURIComponent(search)}` : ''}`,
  );
  return (
    <>
      <PageHeader
        title="Joueurs"
        subtitle="Joueurs ayant joué ou échangé des points dans votre club, ou l’ayant choisi comme club principal."
      />
      <PlayerList players={players} basePath={`/clubs/${clubId}/joueurs`} search={search} />
    </>
  );
}
