'use server';

import { apiRead, apiSend, type ActionResult } from '@/lib/api';

export type CouponCheck = {
  state: 'VALID' | 'USED' | 'EXPIRED' | 'CANCELLED';
  coupon: {
    code: string;
    costGpr: number;
    expiresAt: string;
    usedAt: string | null;
    reward: { title: string; kind: string; discountValue: number | null };
  };
  player: { firstName: string | null; lastInitial: string | null };
};

export async function lookupCoupon(
  clubId: string,
  code: string,
): Promise<ActionResult<CouponCheck>> {
  if (!code.trim()) return { ok: false, error: 'Saisissez ou scannez un code.' };
  return apiRead<CouponCheck>(`/clubs/${clubId}/coupons/${encodeURIComponent(code.trim())}`);
}

export async function validateCoupon(
  clubId: string,
  code: string,
): Promise<ActionResult<CouponCheck>> {
  return apiSend<CouponCheck>(
    `/clubs/${clubId}/coupons/${encodeURIComponent(code.trim())}/validate`,
    'POST',
  );
}
