'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiSend, type ActionResult } from '@/lib/api';

function parse(form: FormData) {
  const str = (k: string) => {
    const v = String(form.get(k) ?? '').trim();
    return v === '' ? null : v;
  };
  const int = (k: string) => (str(k) === null ? null : Number(str(k)));
  const kind = str('kind');
  const rawDiscount = int('discountValue');
  return {
    category: str('category'),
    kind,
    title: str('title'),
    description: str('description'),
    costGpr: int('costGpr'),
    // Montant saisi en euros → centimes
    discountValue:
      kind === 'FREE_ITEM'
        ? null
        : kind === 'DISCOUNT_AMOUNT' && rawDiscount !== null
          ? Math.round(rawDiscount * 100)
          : rawDiscount,
    stock: int('stock'),
    startsAt: str('startsAt'),
    endsAt: str('endsAt'),
    isActive: form.get('isActive') === 'on',
  };
}

export async function saveReward(
  clubId: string,
  rewardId: string | null,
  _prev: ActionResult | null,
  form: FormData,
) {
  const body = parse(form);
  const res = rewardId
    ? await apiSend(`/clubs/${clubId}/admin/rewards/${rewardId}`, 'PATCH', body)
    : await apiSend(`/clubs/${clubId}/admin/rewards`, 'POST', body);
  if (!res.ok) return res;
  revalidatePath(`/clubs/${clubId}/recompenses`);
  redirect(`/clubs/${clubId}/recompenses`);
}
