'use server';

import { revalidatePath } from 'next/cache';
import { apiSend, type ActionResult } from '@/lib/api';

export async function savePartner(
  clubId: string,
  id: string | null,
  _prev: ActionResult | null,
  form: FormData,
) {
  const file = form.get('logo');
  let logo: string | null | undefined;
  if (file instanceof File && file.size > 0) {
    if (file.size > 300 * 1024)
      return { ok: false as const, error: 'Logo trop lourd (300 Ko maximum).' };
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
      return { ok: false as const, error: 'Logo : PNG, JPEG ou WebP uniquement.' };
    logo = `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString('base64')}`;
  } else if (form.get('removeLogo') === 'on') {
    logo = null;
  }
  const body = {
    name: String(form.get('name') ?? ''),
    offer: String(form.get('offer') ?? ''),
    description: String(form.get('description') ?? '').trim() || null,
    address: String(form.get('address') ?? ''),
    isActive: form.get('isActive') === 'on',
    ...(logo !== undefined ? { logo } : {}),
  };
  const res = id
    ? await apiSend(`/clubs/${clubId}/admin/local-partners/${id}`, 'PATCH', body)
    : await apiSend(`/clubs/${clubId}/admin/local-partners`, 'POST', body);
  if (res.ok) revalidatePath(`/clubs/${clubId}/partenaires`);
  return res;
}
