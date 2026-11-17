'use server';

import { revalidatePath } from 'next/cache';
import { apiSend, type ActionResult } from '@/lib/api';

function condition(form: FormData) {
  const type = String(form.get('type'));
  const target = Number(form.get('target'));
  if (type !== 'MATCH') return { type, target };
  const weekdays = form.getAll('weekdays').map(Number).filter(Boolean);
  const str = (k: string) => String(form.get(k) ?? '').trim() || undefined;
  return {
    type,
    target,
    ...(weekdays.length ? { weekdays } : {}),
    ...(str('after') ? { after: str('after') } : {}),
    ...(str('before') ? { before: str('before') } : {}),
    ...(form.get('offPeak') === 'on' ? { offPeak: true } : {}),
  };
}

/** Création / modification d'un défi (club ou groupement selon apiBase). */
export async function saveChallenge(
  apiBase: string,
  pagePath: string,
  id: string | null,
  _prev: ActionResult | null,
  form: FormData,
) {
  const rewardGpr = String(form.get('rewardGpr') ?? '').trim();
  const body = {
    name: String(form.get('name') ?? ''),
    description: String(form.get('description') ?? ''),
    period: String(form.get('period')),
    startsAt: String(form.get('startsAt') ?? ''),
    endsAt: String(form.get('endsAt') ?? '') || null,
    condition: condition(form),
    rewardGpr: rewardGpr ? Number(rewardGpr) : null,
    rewardBadgeId: String(form.get('rewardBadgeId') ?? '') || null,
    isActive: form.get('isActive') === 'on',
  };
  const res = id
    ? await apiSend(`${apiBase}/${id}`, 'PATCH', body)
    : await apiSend(apiBase, 'POST', body);
  if (res.ok) revalidatePath(pagePath);
  return res;
}
