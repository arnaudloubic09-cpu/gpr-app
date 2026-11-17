'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiSend, type ActionResult } from '@/lib/api';

export async function saveVipSettings(_prev: ActionResult | null, form: FormData) {
  const res = await apiSend('/admin/vip/settings', 'PUT', {
    enabled: form.get('enabled') === 'on',
    priceCents: Math.round(Number(form.get('price')) * 100),
    purchaseEnabled: false, // paiement en ligne branché à l'activation (compte Stripe du GPR)
  });
  if (res.ok) revalidatePath('/admin/vip');
  return res;
}

function partnerBody(form: FormData) {
  const str = (k: string) => String(form.get(k) ?? '').trim() || null;
  const max = str('maxCodesPerMember');
  return {
    name: String(form.get('name') ?? ''),
    offer: String(form.get('offer') ?? ''),
    description: str('description'),
    websiteUrl: str('websiteUrl'),
    maxCodesPerMember: max ? Number(max) : null,
    codeValidityDays: Number(form.get('codeValidityDays') ?? 7),
    isActive: form.get('isActive') === 'on',
  };
}

export async function createPartner(_prev: ActionResult | null, form: FormData) {
  const res = await apiSend<{ id: string }>('/admin/vip/partners', 'POST', partnerBody(form));
  if (!res.ok) return res;
  redirect(`/admin/vip/${res.data.id}`);
}

export async function updatePartner(id: string, _prev: ActionResult | null, form: FormData) {
  const res = await apiSend(`/admin/vip/partners/${id}`, 'PATCH', partnerBody(form));
  if (res.ok) revalidatePath('/admin/vip', 'layout');
  return res;
}

export async function importCodes(id: string, _prev: ActionResult | null, form: FormData) {
  const res = await apiSend<{
    received: number;
    added: number;
    duplicates: number;
    remaining: number;
  }>(`/admin/vip/partners/${id}/codes`, 'POST', { codes: String(form.get('codes') ?? '') });
  if (!res.ok) return res;
  revalidatePath('/admin/vip', 'layout');
  return res;
}

export async function grantVip(userId: string, _prev: ActionResult | null, form: FormData) {
  const res = await apiSend(`/admin/vip/players/${userId}/grant`, 'POST', {
    months: Number(form.get('months') ?? 12),
    reason: String(form.get('reason') ?? ''),
  });
  if (res.ok) revalidatePath(`/admin/joueurs/${userId}`);
  return res;
}
