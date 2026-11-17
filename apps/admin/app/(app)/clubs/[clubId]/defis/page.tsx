import Link from 'next/link';
import { ChallengeForm, ChallengeRow, ChallengeTable } from '@/components/challenges';
import { PageHeader } from '@/components/ui';
import { apiGet } from '@/lib/api';
import { saveChallenge } from '@/lib/challenge-actions';

export default async function ClubChallengesPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { clubId } = await params;
  const { edit } = await searchParams;
  const apiBase = `/clubs/${clubId}/admin/challenges`;
  const pagePath = `/clubs/${clubId}/defis`;
  const [rows, badges] = await Promise.all([
    apiGet<ChallengeRow[]>(apiBase),
    apiGet<{ id: string; name: string }[]>('/badges'),
  ]);
  const editing = rows.find((r) => r.id === edit);
  return (
    <>
      <PageHeader
        title="Défis du club"
        subtitle="Comptent uniquement les parties jouées dans votre club, validées 2 h après la fin du créneau."
      />
      <div className="card table-wrap">
        <ChallengeTable rows={rows} editBase={pagePath} />
      </div>
      <h2>
        {editing ? `Modifier « ${editing.name} »` : 'Nouveau défi'}{' '}
        {editing ? (
          <Link href={pagePath} className="small">
            (annuler)
          </Link>
        ) : null}
      </h2>
      <ChallengeForm
        key={editing?.id ?? 'new'}
        scope="club"
        badges={badges}
        initial={editing}
        action={saveChallenge.bind(null, apiBase, pagePath, editing?.id ?? null)}
      />
    </>
  );
}
