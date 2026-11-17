import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui';
import { apiGet } from '@/lib/api';
import { saveReward } from '../actions';
import { RewardForm, RewardFormValues } from '../reward-form';

export default async function EditRewardPage({
  params,
}: {
  params: Promise<{ clubId: string; rewardId: string }>;
}) {
  const { clubId, rewardId } = await params;
  const reward = (
    await apiGet<(RewardFormValues & { id: string })[]>(`/clubs/${clubId}/admin/rewards`)
  ).find((r) => r.id === rewardId);
  if (!reward) notFound();
  return (
    <>
      <PageHeader
        title="Modifier la récompense"
        subtitle="Les coupons déjà émis ne sont pas modifiés."
        actions={<Link href={`/clubs/${clubId}/recompenses`}>← Retour</Link>}
      />
      <RewardForm action={saveReward.bind(null, clubId, rewardId)} initial={reward} />
    </>
  );
}
