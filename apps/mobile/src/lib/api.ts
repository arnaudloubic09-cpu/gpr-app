import type { AuthTokens } from '@gpr/core';
import { API_URL } from '../config';
import { storage } from './storage';

const ACCESS = 'gpr.access';
const REFRESH = 'gpr.refresh';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(fn: () => void) {
  onSessionExpired = fn;
}

export async function saveTokens(tokens: AuthTokens) {
  await storage.set(ACCESS, tokens.accessToken);
  await storage.set(REFRESH, tokens.refreshToken);
}

export async function clearTokens() {
  await storage.remove(ACCESS);
  await storage.remove(REFRESH);
}

export async function hasSession() {
  return !!(await storage.get(REFRESH));
}

// Un seul renouvellement à la fois, même si plusieurs requêtes reçoivent un 401 en même temps.
let refreshing: Promise<boolean> | null = null;
async function refreshTokens(): Promise<boolean> {
  refreshing ??= (async () => {
    const refreshToken = await storage.get(REFRESH);
    if (!refreshToken) return false;
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    await saveTokens((await res.json()) as AuthTokens);
    return true;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function errorFrom(res: Response): Promise<ApiError> {
  let message = 'Une erreur est survenue, réessayez.';
  let code: string | undefined;
  try {
    const body = await res.json();
    code = body.code;
    if (typeof body.message === 'string') message = body.message;
  } catch {
    /* réponse sans JSON */
  }
  return new ApiError(res.status, message, code);
}

/** Appel authentifié à l'API, avec renouvellement transparent de la session. */
export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
  retry = true,
): Promise<T> {
  const token = await storage.get(ACCESS);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(0, 'Connexion impossible. Vérifiez votre réseau.');
  }

  if (res.status === 401 && retry) {
    if (await refreshTokens()) return api<T>(path, init, false);
    await clearTokens();
    onSessionExpired?.();
    throw new ApiError(401, 'Votre session a expiré, reconnectez-vous.');
  }
  if (!res.ok) throw await errorFrom(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Appels publics (connexion). */
export async function publicPost<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Connexion impossible. Vérifiez votre réseau.');
  }
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as T;
}
