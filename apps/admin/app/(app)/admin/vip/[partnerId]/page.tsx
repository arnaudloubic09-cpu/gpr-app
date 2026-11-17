import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm } from '@/components/action-form';
import { PartnerForm, PartnerValues } from '@/components/partner-form';
import { Kpi, PageHeader } from '@/components/ui';
import { apiGet } from '@/lib/api';
import { n } from '@/lib/format';
import { importCodes, updatePartner } from '../actions';

export default async function PartnerPage({ params }: { params: Promise<{ partnerId: string }> }) {
  const { partnerId } = await params;
  const o = await apiGet<{
    partners: (PartnerValues & {
      id: string;
      codes: { total: number; assigned: number; remaining: number };
    })[];
  }>('/admin/vip');
  const p = o.partners.find((x) => x.id === partnerId);
  if (!p) notFound();
  return (
    <>
      <PageHeader
        title={p.name}
        subtitle={p.offer}
        actions={<Link href="/admin/vip">← Carte VIP</Link>}
      />
      <div className="grid">
        <Kpi
          label="Codes restants"
          value={n(p.codes.remaining)}
          tone={p.codes.remaining < 20 ? 'warn' : undefined}
          hint="alerte email sous 20 codes"
        />
        <Kpi label="Codes distribués" value={n(p.codes.assigned)} />
        <Kpi label="Codes importés" value={n(p.codes.total)} />
      </div>
      <div className="two-cols">
        <PartnerForm action={updatePartner.bind(null, partnerId)} initial={p} />
        <ActionForm
          action={importCodes.bind(null, partnerId)}
          submitLabel="Importer les codes"
          successMessage="Codes importés (doublons ignorés)."
          className="card"
        >
          <h2>Importer des codes</h2>
          <p className="muted small">
            Collez la liste fournie par le partenaire : un code par ligne (ou séparés par des
            virgules). Les codes déjà présents sont ignorés. Chaque code n’est attribué qu’une seule
            fois.
          </p>
          <label htmlFor="codes">Codes</label>
          <textarea
            id="codes"
            name="codes"
            rows={10}
            required
            placeholder={'PADEL15-A1B2C3\nPADEL15-D4E5F6\n…'}
            spellCheck={false}
          />
        </ActionForm>
      </div>
    </>
  );
}
