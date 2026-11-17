import Link from 'next/link';
import { Empty } from '@/components/ui';
import { dateTime } from '@/lib/format';

export type PlayerRow = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  lastLoginAt: string | null;
  favoriteClub: { name: string } | null;
};

export function PlayerList({
  players,
  basePath,
  search,
}: {
  players: PlayerRow[];
  basePath: string;
  search?: string;
}) {
  return (
    <>
      <form className="card inline-form" method="get">
        <input
          name="search"
          defaultValue={search}
          placeholder="Nom, prénom ou email"
          aria-label="Rechercher un joueur"
        />
        <button>Rechercher</button>
      </form>
      <div className="card table-wrap">
        {players.length === 0 ? (
          <Empty>Aucun joueur trouvé.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Joueur</th>
                <th>Email</th>
                <th>Club principal</th>
                <th>Dernière connexion</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`${basePath}/${p.id}`}>
                      {[p.firstName, p.lastName].filter(Boolean).join(' ') || '(profil incomplet)'}
                    </Link>
                  </td>
                  <td>{p.email}</td>
                  <td>{p.favoriteClub?.name ?? '—'}</td>
                  <td className="small">{dateTime(p.lastLoginAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
