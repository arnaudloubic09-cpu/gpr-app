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

export async function saveLogo(clubId: string, _prev: ActionResult | null, form: FormData) {
  let logo: string | null;
  const file = form.get('logo');
  if (form.get('removeLogo') === 'on') logo = null;
  else if (file instanceof File && file.size > 0) {
    if (file.size > 300 * 1024)
      return { ok: false as const, error: 'Logo trop lourd (300 Ko maximum).' };
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
      return { ok: false as const, error: 'Logo : PNG, JPEG ou WebP uniquement.' };
    logo = `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString('base64')}`;
  } else return { ok: false as const, error: 'Choisissez un fichier.' };
  const res = await apiSend(`/clubs/${clubId}/logo`, 'PUT', { logo });
  if (res.ok) revalidatePath('/', 'layout');
  return res;
}
