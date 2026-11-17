'use client';

import { parseCounterCode } from '@gpr/core';
import { useRef, useState, useTransition } from 'react';
import { CouponCheck, lookupCoupon, lookupMember, MemberCheck, validateCoupon } from './actions';

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
 * Écran comptoir. Une douchette USB se comporte comme un clavier : elle « tape » le code puis « Entrée ».
 * (Une douchette réglée en QWERTY sur un poste AZERTY est corrigée automatiquement par l'API.)
 *  - mode standard : vérifier → valider ;
 *  - mode « un geste » (option du club) : validation immédiate, champ vidé pour le client suivant.
 */
export function Counter({ clubId, autoValidate }: { clubId: string; autoValidate: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [check, setCheck] = useState<CouponCheck | null>(null);
  const [validated, setValidated] = useState<CouponCheck | null>(null);
  const [member, setMember] = useState<MemberCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const focusInput = () => setTimeout(() => input.current?.focus(), 0);

  const reset = () => {
    setMember(null);
    setCode('');
    setCheck(null);
    setValidated(null);
    setError(null);
    focusInput();
  };

  const onMember = () =>
    start(async () => {
      setCheck(null);
      setValidated(null);
      setError(null);
      const res = await lookupMember(clubId, code);
      if (res.ok) setMember(res.data);
      else {
        setMember(null);
        setError(res.error);
      }
      setCode('');
      focusInput();
    });

  const onAutoValidate = () =>
    start(async () => {
      setCheck(null);
      setMember(null);
      setValidated(null);
      setError(null);
      const res = await validateCoupon(clubId, code);
      if (res.ok) setValidated(res.data);
      else setError(res.error);
      setCode('');
      focusInput();
    });

  const onLookup = () =>
    start(async () => {
      setValidated(null);
      setMember(null);
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
          // Carte de membre (GPRM-…) : affichage des avantages, rien à valider.
          if (parseCounterCode(code)?.kind === 'member') onMember();
          else if (autoValidate) onAutoValidate();
          else onLookup();
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
            {pending
              ? autoValidate
                ? 'Validation…'
                : 'Recherche…'
              : autoValidate
                ? 'Valider'
                : 'Vérifier'}
          </button>
        </div>
        <p className="hint">
          Coupon (GPR-…) ou carte de membre (GPRM-…) : le code est affiché sous le QR code dans
          l’application du joueur. Avec une douchette USB, il suffit de scanner.
        </p>
      </form>

      {error && !check ? (
        <div className="card counter-result KO" role="alert">
          <h2>Coupon refusé</h2>
          <p>{error}</p>
          {autoValidate ? (
            <p className="muted">Scannez le coupon suivant quand vous voulez.</p>
          ) : (
            <button className="secondary" onClick={reset}>
              Nouveau coupon
            </button>
          )}
        </div>
      ) : null}

      {member ? (
        <div className="card counter-result VALID" role="status">
          <div className="muted">Carte de membre</div>
          <h2>
            {member.player.firstName} {member.player.lastInitial}. · Niveau {member.level.label}
          </h2>
          {member.perks.length ? (
            <>
              <p>Avantages dans votre club, à appliquer en caisse :</p>
              {member.perks.map((p) => (
                <p key={p.id}>
                  <strong>{p.label}</strong>
                </p>
              ))}
            </>
          ) : (
            <p className="muted">Pas d’avantage à ce niveau dans votre club.</p>
          )}
          <button className="secondary" onClick={reset}>
            Terminé
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
          {autoValidate ? (
            <p className="muted">Prêt pour le coupon suivant : scannez directement.</p>
          ) : (
            <button className="big-btn" onClick={reset}>
              Coupon suivant
            </button>
          )}
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
