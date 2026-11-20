import Link from 'next/link';
import { ChallengeForm, ChallengeRow, ChallengeTable } from '@/components/challenges';
import { PageHeader } from '@/components/ui';
import { apiGet } from '@/lib/api';
import { saveChallenge } from '@/lib/challenge-actions';

export default async function NetworkChallengesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const { edit } = await searchParams;
  const [rows, badges] = await Promise.all([
    apiGet<ChallengeRow[]>('/admin/challenges'),
    apiGet<{ id: string; name: string }[]>('/badges'),
  ]);
  const editing = rows.find((r) => r.id === edit);
  return (
    <>
      <PageHeader
        title="Défis du groupement"
        subtitle="Comptent les parties jouées dans tous les clubs du groupement. Récompense : un badge (les points sont propres à chaque club)."
      />
      <div className="card table-wrap">
        <ChallengeTable rows={rows} editBase="/admin/defis" scope="network" />
      </div>
      <h2>
        {editing ? `Modifier « ${editing.name} »` : 'Nouveau défi'}{' '}
        {editing ? (
          <Link href="/admin/defis" className="small">
            (annuler)
          </Link>
        ) : null}
      </h2>
      <ChallengeForm
        key={editing?.id ?? 'new'}
        scope="network"
        badges={badges}
        initial={editing}
        action={saveChallenge.bind(null, '/admin/challenges', '/admin/defis', editing?.id ?? null)}
      />
    </>
  );
}
