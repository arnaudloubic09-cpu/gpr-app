'use client';

import { useActionState } from 'react';
import { loginAction, type LoginState } from './actions';

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {
    step: 'email',
  });

  return (
    <form action={action}>
      {state.step === 'email' ? (
        <>
          <label htmlFor="email">Email professionnel</label>
          <input id="email" name="email" type="email" autoComplete="email" required autoFocus />
          <button disabled={pending}>{pending ? 'Envoi…' : 'Recevoir un code'}</button>
        </>
      ) : (
        <>
          <p className="muted">{state.info}</p>
          <label htmlFor="code">Code reçu par email ({state.email})</label>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            required
            autoFocus
          />
          <button disabled={pending}>{pending ? 'Vérification…' : 'Se connecter'}</button>
        </>
      )}
      {state.error && <p className="error">{state.error}</p>}
    </form>
  );
}
