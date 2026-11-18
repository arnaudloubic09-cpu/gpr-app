'use server';

import { revalidatePath } from 'next/cache';
import { apiSend, type ActionResult } from '@/lib/api';

const WEEKDAYS = [1, 2, 3, 4, 5];

export async function saveRules(levels: unknown, _prev: ActionResult | null, form: FormData) {
  const num = (k: string) => Number(form.get(k));
  const windows = [1, 2]
    .map((i) => ({
      start: String(form.get(`w${i}start`) ?? ''),
      end: String(form.get(`w${i}end`) ?? ''),
    }))
    .filter((w) => w.start && w.end)
    .map((w) => ({ days: WEEKDAYS, ...w }));
  const res = await apiSend('/admin/rules', 'POST', {
    pointsPerSlot: num('pointsPerSlot'),
    slotMinutes: num('slotMinutes'),
    dailyCapPerPlayer: null,
    dailyMaxMinutes: String(form.get('dailyMaxMinutes') ?? '').trim()
      ? num('dailyMaxMinutes')
      : null,
    pendingDelayMinutes: num('pendingDelayHours') * 60,
    expirationMonths: num('expirationMonths'),
    couponValidityDays: num('couponValidityDays'),
    clubAdjustmentMax: num('clubAdjustmentMax'),
    offPeakMultiplier: num('offPeakMultiplier'),
    offPeakWindows: windows,
    levels,
  });
  if (res.ok) revalidatePath('/admin/regles');
  return res;
}
