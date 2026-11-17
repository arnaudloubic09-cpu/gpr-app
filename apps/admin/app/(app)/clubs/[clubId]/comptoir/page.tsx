import { PageHeader } from '@/components/ui';
import { apiGet } from '@/lib/api';
import { Counter } from './counter';

export default async function CounterPage({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params;
  const club = await apiGet<{ counterAutoValidate: boolean }>(`/clubs/${clubId}`);
  return (
    <>
      <PageHeader
        title="Comptoir"
        subtitle={
          club.counterAutoValidate
            ? 'Validation en un geste activée : scannez ou saisissez le code, le coupon est validé immédiatement.'
            : 'Scannez ou saisissez le code, vérifiez, puis validez le coupon présenté par le joueur.'
        }
      />
      <Counter clubId={clubId} autoValidate={club.counterAutoValidate} />
    </>
  );
}
