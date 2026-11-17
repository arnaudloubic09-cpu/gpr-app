'use server';

import { revalidatePath } from 'next/cache';
import { apiSend, type ActionResult } from '@/lib/api';

/** Ajustement depuis l'espace club ou l'espace super admin (basePath = route API du joueur). */
export async function adjustPoints(
  apiPlayerPath: string,
  pagePath: string,
  _prev: ActionResult | null,
  form: FormData,
) {
  const amount = Number(form.get('amount'));
  const direction = form.get('direction') === 'remove' ? -1 : 1;
  const res = await apiSend(`${apiPlayerPath}/adjustments`, 'POST', {
    amount: Math.abs(amount) * direction,
    reason: String(form.get('reason') ?? ''),
  });
  if (res.ok) revalidatePath(pagePath);
  return res;
}
