'use server';

import { redirect } from 'next/navigation';
import { partnerCall } from '@/lib/partner';

export async function validateUse(t: string) {
  const res = await partnerCall(`/uses/${encodeURIComponent(t)}`, 'POST');
  redirect(`/partenaire/valider?t=${encodeURIComponent(t)}&${res.ok ? 'ok=1' : 'ko=1'}`);
}
