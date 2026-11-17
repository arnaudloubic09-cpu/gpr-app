import { PageHeader } from '@/components/ui';
import { Counter } from './counter';

export default async function CounterPage({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params;
  return (
    <>
      <PageHeader
        title="Comptoir"
        subtitle="Vérifiez puis validez le coupon présenté par le joueur."
      />
      <Counter clubId={clubId} />
    </>
  );
}
