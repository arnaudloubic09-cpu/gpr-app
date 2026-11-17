'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiSend, type ActionResult } from '@/lib/api';

export async function createClub(_prev: ActionResult | null, form: FormData) {
  const res = await apiSend<{ id: string }>('/admin/clubs', 'POST', {
    name: String(form.get('name') ?? ''),
    city: String(form.get('city') ?? ''),
    timezone: 'Europe/Paris',
  });
  if (!res.ok) return res;
  redirect(`/admin/clubs/${res.data.id}`);
}

export async function updateClub(clubId: string, _prev: ActionResult | null, form: FormData) {
  const res = await apiSend(`/admin/clubs/${clubId}`, 'PATCH', {
    name: String(form.get('name') ?? ''),
    city: String(form.get('city') ?? ''),
    timezone: String(form.get('timezone') ?? 'Europe/Paris'),
    isActive: form.get('isActive') === 'on',
  });
  if (res.ok) revalidatePath('/admin', 'layout');
  return res;
}

export async function saveConnector(clubId: string, _prev: ActionResult | null, form: FormData) {
  const raw = String(form.get('credentials') ?? '').trim();
  let credentials: Record<string, string> | undefined;
  if (raw) {
    try {
      credentials = JSON.parse(raw);
    } catch {
      return {
        ok: false as const,
        error: 'Identifiants : format JSON attendu, ex. {"apiKey": "…"}',
      };
    }
  }
  const res = await apiSend(`/admin/clubs/${clubId}/connector`, 'PUT', {
    provider: String(form.get('provider')),
    externalClubId: String(form.get('externalClubId') ?? ''),
    syncIntervalMinutes: Number(form.get('syncIntervalMinutes')),
    ...(credentials ? { credentials } : {}),
  });
  if (res.ok) revalidatePath(`/admin/clubs/${clubId}`);
  return res;
}

export async function triggerSync(clubId: string, _prev: ActionResult | null) {
  const res = await apiSend<{
    status: string;
    run?: { error: string | null; bookingsFetched: number; entriesCreated: number };
  }>(`/clubs/${clubId}/sync`, 'POST');
  revalidatePath(`/admin/clubs/${clubId}`);
  if (!res.ok) return res;
  if (res.data.status === 'SKIPPED')
    return { ok: false as const, error: 'Une synchronisation est déjà en cours.' };
  if (res.data.status === 'FAILED')
    return { ok: false as const, error: `Échec : ${res.data.run?.error}` };
  return res;
}
