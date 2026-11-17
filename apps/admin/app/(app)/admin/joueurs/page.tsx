import { PlayerList, PlayerRow } from '@/components/player-list';
import { PageHeader } from '@/components/ui';
import { apiGet } from '@/lib/api';

export default async function AdminPlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const { search } = await searchParams;
  const players = await apiGet<PlayerRow[]>(
    `/admin/players${search ? `?search=${encodeURIComponent(search)}` : ''}`,
  );
  return (
    <>
      <PageHeader
        title="Joueurs du groupement"
        subtitle="Tous les joueurs inscrits, tous clubs confondus."
      />
      <PlayerList players={players} basePath="/admin/joueurs" search={search} />
    </>
  );
}
