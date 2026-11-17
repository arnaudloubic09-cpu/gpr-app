'use client';

import { ReactNode, useActionState } from 'react';
import type { ActionResult } from '@/lib/api';

type Action = (prev: ActionResult | null, form: FormData) => Promise<ActionResult | null>;

/** Formulaire relié à une server action, avec affichage du succès ou de l'erreur. */
export function ActionForm({
  action,
  children,
  submitLabel,
  successMessage,
  className,
  confirm,
  variant,
}: {
  action: Action;
  children?: ReactNode;
  submitLabel: string;
  successMessage?: string;
  className?: string;
  confirm?: string;
  variant?: 'secondary' | 'danger';
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);
  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      <button disabled={pending} className={variant}>
        {pending ? 'Enregistrement…' : submitLabel}
      </button>
      {state && !state.ok ? (
        <p className="error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.ok && successMessage ? (
        <p className="success" role="status">
          {successMessage}
        </p>
      ) : null}
    </form>
  );
}
