'use server';

import { redirect } from 'next/navigation';
import type { AuthTokens } from '@gpr/core';
import { API_URL, clearTokens, getRefreshToken, saveTokens } from '@/lib/session';

export interface LoginState {
  step: 'email' | 'code';
  email?: string;
  error?: string;
  info?: string;
}

export async function loginAction(prev: LoginState, form: FormData): Promise<LoginState> {
  if (prev.step === 'email') {
    const email = String(form.get('email') ?? '')
      .trim()
      .toLowerCase();
    const res = await fetch(`${API_URL}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, audience: 'ADMIN' }),
    });
    if (res.status === 429)
      return { step: 'email', error: 'Trop de demandes, réessayez dans quelques minutes.' };
    if (!res.ok) return { step: 'email', error: 'Adresse email invalide.' };
    return {
      step: 'code',
      email,
      info: 'Si ce compte administrateur existe, un code a été envoyé par email.',
    };
  }

  const code = String(form.get('code') ?? '').trim();
  const res = await fetch(`${API_URL}/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: prev.email, code, audience: 'ADMIN' }),
  });
  if (!res.ok) return { ...prev, info: undefined, error: 'Code invalide ou expiré.' };
  await saveTokens((await res.json()) as AuthTokens);
  redirect('/dashboard');
}

export async function logoutAction() {
  const refreshToken = await getRefreshToken();
  if (refreshToken) {
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => undefined);
  }
  await clearTokens();
  redirect('/login');
}
