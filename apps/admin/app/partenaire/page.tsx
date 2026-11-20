import { dateTime, n } from '@/lib/format';
import { NotRecognized } from '@/components/partner-not-recognized';
import { partnerCall, partnerToken } from '@/lib/partner';

type Portal = {
  partner: { name: string; offer: string; club: string; isActive: boolean };
  stats: { thisMonth: number; lastMonth: number; total: number };
  recent: { usedAt: string; player: string }[];
};

/** Page du partenaire local : suivi des utilisations et mode d'emploi. */
export default async function PartnerHome() {
  if (!(await partnerToken())) return <NotRecognized />;
  const res = await partnerCall<Portal>('');
  if (!res.ok) return <NotRecognized replaced={res.status === 401} />;
  const { partner, stats, recent } = res.data;
  return (
    <>
      <div className="card">
        <h1>{partner.name}</h1>
        <p className="muted">
          Partenaire de <strong>{partner.club}</strong> · programme de fidélité GPR
        </p>
        <p>
          Avantage : <span className="badge-role">{partner.offer}</span>
        </p>
        {!partner.isActive ? <p className="error">Partenariat suspendu par le club.</p> : null}
      </div>
      <div className="grid">
        <div className="card kpi">
          <div className="muted small">Ce mois-ci</div>
          <div className="kpi-value">{n(stats.thisMonth)}</div>
        </div>
        <div className="card kpi">
          <div className="muted small">Mois dernier</div>
          <div className="kpi-value">{n(stats.lastMonth)}</div>
        </div>
        <div className="card kpi">
          <div className="muted small">Depuis le début</div>
          <div className="kpi-value">{n(stats.total)}</div>
        </div>
      </div>
      <div className="card">
        <h2>Valider un avantage</h2>
        <ol>
          <li>Le joueur ouvre l’app GPR et affiche le QR code de votre avantage.</li>
          <li>Scannez-le avec l’appareil photo de ce téléphone.</li>
          <li>Vérifiez le prénom affiché, puis appuyez sur « Valider l’avantage ».</li>
        </ol>
        <p className="muted small">
          Chaque QR code ne sert qu’une fois et expire au bout de 10 minutes. Astuce : ajoutez cette
          page à l’écran d’accueil de votre téléphone.
        </p>
      </div>
      <div className="card table-wrap">
        <h2>Dernières utilisations</h2>
        {recent.length === 0 ? (
          <p className="muted">Aucune utilisation pour le moment.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Joueur</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r, i) => (
                <tr key={i}>
                  <td>{dateTime(r.usedAt)}</td>
                  <td>{r.player}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
