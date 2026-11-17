'use server';

import { revalidatePath } from 'next/cache';
import { apiSend, type ActionResult } from '@/lib/api';

export async function createAdmin(_prev: ActionResult | null, form: FormData) {
  const role = String(form.get('role'));
  const res = await apiSend('/admin/users', 'POST', {
    email: String(form.get('email') ?? ''),
    firstName: String(form.get('firstName') ?? ''),
    lastName: String(form.get('lastName') ?? ''),
    role,
    clubId: role === 'CLUB_ADMIN' ? String(form.get('clubId') ?? '') || null : null,
  });
  if (res.ok) revalidatePath('/admin/comptes');
  return res;
}

export async function toggleAdmin(
  userId: string,
  action: 'disable' | 'enable',
  _prev: ActionResult | null,
) {
  const res = await apiSend(`/admin/users/${userId}/${action}`, 'POST');
  if (res.ok) revalidatePath('/admin/comptes');
  return res;
}
