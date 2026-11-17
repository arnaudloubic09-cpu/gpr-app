'use server';

import { revalidatePath } from 'next/cache';
import { apiSend, type ActionResult } from '@/lib/api';

export async function saveSettings(clubId: string, _prev: ActionResult | null, form: FormData) {
  const res = await apiSend(`/clubs/${clubId}/settings`, 'PATCH', {
    offPeakBonusEnabled: form.get('offPeakBonusEnabled') === 'on',
    counterAutoValidate: form.get('counterAutoValidate') === 'on',
  });
  if (res.ok) revalidatePath(`/clubs/${clubId}`, 'layout');
  return res;
}
