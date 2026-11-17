'use client';

import { useRef, useState, useTransition } from 'react';
import { CouponCheck, lookupCoupon, validateCoupon } from './actions';

const STATE_TEXT: Record<CouponCheck['state'], string> = {
  VALID: 'Coupon valable',
  USED: 'Coupon déjà utilisé',
  EXPIRED: 'Coupon expiré',
  CANCELLED: 'Coupon annulé',
};

function value(r: CouponCheck['coupon']['reward']) {
  if (r.kind === 'DISCOUNT_PERCENT') return `Réduction de ${r.discountValue} %`;
  if (r.kind === 'DISCOUNT_AMOUNT')
    return `Réduction de ${((r.discountValue ?? 0) / 100).toLocaleString('fr-FR')} €`;
  return 'Offert';
}

/**
 * Écran comptoir : la personne à l'accueil tape le code (ou le scanne avec une douchette USB,
 * qui saisit le code puis « Entrée »), vérifie, puis valide. Un coupon ne sert qu'une fois.
 */
export function Counter({ clubId }: { clubId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [check, setCheck] = useState<CouponCheck | null>(null);
  const [validated, setValidated] = useState<CouponCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const reset = () => {
    setCode('');
    setCheck(null);
    setValidated(null);
    setError(null);
    setTimeout(() => input.current?.focus(), 0);
  };

  const onLookup = () =>
    start(async () => {
      setValidated(null);
      setError(null);
      const res = await lookupCoupon(clubId, code);
      if (res.ok) setCheck(res.data);
      else {
        setCheck(null);
        setError(res.error);
      }
    });

  const onValidate = () =>
    start(async () => {
      const res = await validateCoupon(clubId, check!.coupon.code);
      if (res.ok) setValidated(res.data);
      else setError(res.error);
    });

  return (
    <>
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          onLookup();
        }}
      >
        <label htmlFor="code">Code du coupon</label>
        <div className="inline-form">
          <input
            id="code"
            ref={input}
            className="counter-input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="GPR-XXXX-XXXX"
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />
          <button disabled={pending || !code.trim()}>
            {pending && !check ? 'Recherche…' : 'Vérifier'}
          </button>
        </div>
        <p className="hint">
          Le code est affiché sous le QR code dans l’application du joueur. Une douchette USB
          fonctionne aussi.
        </p>
      </form>

      {error && !check ? (
        <div className="card counter-result KO" role="alert">
          <h2>Coupon refusé</h2>
          <p>{error}</p>
          <button className="secondary" onClick={reset}>
            Nouveau coupon
          </button>
        </div>
      ) : null}

      {validated ? (
        <div className="card counter-result OK" role="status">
          <h2>✓ Coupon validé</h2>
          <p>
            <strong>{validated.coupon.reward.title}</strong> — {value(validated.coupon.reward)}
          </p>
          <p>
            Remettez la récompense à {validated.player.firstName} {validated.player.lastInitial}.
          </p>
          <button className="big-btn" onClick={reset}>
            Coupon suivant
          </button>
        </div>
      ) : check ? (
        <div className={`card counter-result ${check.state === 'VALID' ? 'VALID' : 'KO'}`}>
          <div className="muted">{STATE_TEXT[check.state]}</div>
          <h2>{check.coupon.reward.title}</h2>
          <p>
            {value(check.coupon.reward)} · {check.coupon.costGpr} points GPR ·{' '}
            {check.player.firstName} {check.player.lastInitial}.
          </p>
          {check.state === 'VALID' ? (
            <>
              <button className="big-btn" onClick={onValidate} disabled={pending}>
                {pending ? 'Validation…' : 'Valider et remettre la récompense'}
              </button>
              {error ? (
                <p className="error" role="alert">
                  {error}
                </p>
              ) : null}
            </>
          ) : (
            <p className="error">
              {check.state === 'USED' && check.coupon.usedAt
                ? `Déjà utilisé le ${new Date(check.coupon.usedAt).toLocaleString('fr-FR')}.`
                : 'Ce coupon ne peut plus être utilisé.'}
            </p>
          )}
          <div>
            <button className="secondary" onClick={reset}>
              Annuler
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
