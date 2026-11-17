import 'server-only';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { API_URL } from './session';

const REWARD_ERRORS: Record<string, string> = {
  CATEGORY_NOT_ALLOWED: 'Catégorie non autorisée (aucune récompense sur une partie de padel).',
  KIND_NOT_ALLOWED: 'Type de récompense invalide.',
  DISCOUNT_ONLY_CATEGORY: 'Un cours ne peut être proposé qu’en réduction, jamais gratuitement.',
  INVALID_COST: 'Le coût en points GPR doit être un nombre entier positif.',
  INVALID_DISCOUNT_VALUE: 'Valeur de réduction invalide (1 à 100 % ou un montant positif).',
  END_BEFORE_START: 'La date de fin doit être après la date de début.',
};

/** Message lisible à partir d'une réponse d'erreur de l'API. */
export function errorMessage(body: unknown): string {
  const b = body as { message?: unknown; issues?: { path: string; message: string }[] } | null;
  if (b?.issues?.length) {
    return b.issues
      .map((i) => REWARD_ERRORS[i.message] ?? (i.path ? `${i.path} : ${i.message}` : i.message))
      .join(' ');
  }
  if (typeof b?.message === 'string') return b.message;
  return 'Une erreur est survenue.';
}

async function call(path: string, init: RequestInit = {}) {
  const token = (await cookies()).get('gpr_access')?.value;
  return fetch(`${API_URL}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

/** Lecture côté serveur : redirige vers la connexion (401), l'accueil (403) ou la page 404. */
export async function apiGet<T>(path: string): Promise<T> {
  const res = await call(path);
  if (res.status === 401) redirect('/login');
  if (res.status === 403) redirect('/dashboard');
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(errorMessage(await res.json().catch(() => null)));
  return (await res.json()) as T;
}

export type ActionResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

/** Écriture (depuis une server action) : renvoie un résultat affichable dans le formulaire. */
export async function apiSend<T = unknown>(
  path: string,
  method: 'POST' | 'PATCH' | 'PUT',
  body?: unknown,
): Promise<ActionResult<T>> {
  const res = await call(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) redirect('/login');
  const data = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, error: errorMessage(data) };
  return { ok: true, data: data as T };
}

/** Lecture depuis une server action : renvoie l'erreur au lieu de rediriger. */
export async function apiRead<T>(path: string): Promise<ActionResult<T>> {
  const res = await call(path);
  if (res.status === 401) redirect('/login');
  const data = await res.json().catch(() => null);
  return res.ok ? { ok: true, data: data as T } : { ok: false, error: errorMessage(data) };
}
