import { dateTime } from '@/lib/format';
import { partnerCall, partnerToken } from '@/lib/partner';
import { NotRecognized } from '@/components/partner-not-recognized';
import { validateUse } from './actions';

type Preview = {
  status: 'VALID' | 'USED' | 'EXPIRED';
  usedAt: string | null;
  player: string;
  partner: { name: string; offer: string };
};

/** Le partenaire a scanné le QR code d'un joueur : vérification puis validation. */
export default async function ValidatePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; ok?: string }>;
}) {
  const { t, ok } = await searchParams;
  if (!(await partnerToken())) return <NotRecognized />;
  if (!t) return <p className="muted">Scannez le QR code affiché par le joueur.</p>;
  const res = await partnerCall<Preview>(`/uses/${encodeURIComponent(t)}`);
  if (!res.ok) {
    if (res.status === 401) return <NotRecognized replaced />;
    return (
      <div className="card counter-result KO">
        <h2>QR code refusé</h2>
        <p>{res.error}</p>
      </div>
    );
  }
  const p = res.data;
  if (p.status === 'USED')
    return (
      <div className={`card counter-result ${ok ? 'OK' : 'KO'}`}>
        <h2>{ok ? '✓ Avantage validé' : 'Déjà utilisé'}</h2>
        <p>
          <strong>{p.player}</strong> · {p.partner.offer}
        </p>
        <p className="muted small">Validé le {dateTime(p.usedAt)}</p>
        <p>
          <a href="/partenaire">Voir mon suivi</a>
        </p>
      </div>
    );
  if (p.status === 'EXPIRED')
    return (
      <div className="card counter-result KO">
        <h2>QR code expiré</h2>
        <p>Demandez au joueur d’afficher un nouveau QR code dans son app.</p>
      </div>
    );
  return (
    <form action={validateUse.bind(null, t)} className="card counter-result VALID">
      <p className="muted">Avantage {p.partner.name}</p>
      <h2>{p.player}</h2>
      <p>
        <span className="badge-role">{p.partner.offer}</span>
      </p>
      <button className="big-btn">Valider l’avantage</button>
    </form>
  );
}
