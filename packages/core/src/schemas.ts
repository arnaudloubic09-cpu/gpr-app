import { z } from 'zod';
import { ConsentType, OtpAudience } from './enums';

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const otpRequestSchema = z.object({
  email: emailSchema,
  audience: z.nativeEnum(OtpAudience),
});
export type OtpRequest = z.infer<typeof otpRequestSchema>;

export const otpVerifySchema = z.object({
  email: emailSchema,
  code: z.string().regex(/^\d{6}$/),
  audience: z.nativeEnum(OtpAudience),
});
export type OtpVerify = z.infer<typeof otpVerifySchema>;

export const refreshSchema = z.object({ refreshToken: z.string().min(20).max(200) });

export const clubSettingsSchema = z
  .object({ offPeakBonusEnabled: z.boolean(), counterAutoValidate: z.boolean() })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Aucun paramètre fourni');
export type ClubSettings = z.infer<typeof clubSettingsSchema>;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface MeResponse {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  role: string;
  clubId: string | null;
  favoriteClubId: string | null;
  /** RGPD : date de suppression programmée (rétractation possible jusque-là). */
  deletionScheduledFor?: string | Date | null;
}

export const updateProfileSchema = z
  .object({
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().min(1).max(60),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 .-]{8,20}$/)
      .nullable(),
    favoriteClubId: z.string().uuid().nullable(),
  })
  .partial()
  .strict();
export type UpdateProfile = z.infer<typeof updateProfileSchema>;

export const redeemSchema = z.object({
  /** Identifiant généré par l'app pour chaque demande : un double appui ne crée qu'un seul coupon. */
  requestId: z.string().uuid(),
});
export type RedeemRequest = z.infer<typeof redeemSchema>;

export interface RewardView {
  id: string;
  clubId: string;
  category: string;
  kind: string;
  title: string;
  description: string | null;
  costGpr: number;
  discountValue: number | null;
  /** null = stock illimité */
  stock: number | null;
  available: boolean;
  endsAt: string | null;
}

export interface CouponView {
  id: string;
  code: string;
  status: 'ACTIVE' | 'USED' | 'EXPIRED' | 'CANCELLED';
  costGpr: number;
  expiresAt: string;
  usedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  reward: {
    id: string;
    title: string;
    category: string;
    kind: string;
    discountValue: number | null;
  };
  club: { id: string; name: string };
}

export interface ClubBalanceView {
  club: { id: string; name: string };
  /** Club principal du joueur (affiché en premier). */
  favorite: boolean;
  available: number;
  pending: number;
  expiringSoon: number;
}

/**
 * Solde du joueur. Les points ne sont utilisables que dans le club où ils ont été gagnés :
 * `clubs` donne le solde de chaque club ; les totaux sont indicatifs.
 */
export interface BalanceView {
  available: number;
  pending: number;
  expiringSoon: number;
  clubs: ClubBalanceView[];
}

export interface TransactionItem {
  id: string;
  type: string;
  label: string;
  amount: number;
  status: 'PENDING' | 'VALIDATED';
  club: { id: string; name: string } | null;
  reason: string | null;
  /** Date de l'événement : fin de la partie pour un gain, date de l'opération sinon. */
  earnedAt: string;
  createdAt: string;
}

export const consentsUpdateSchema = z
  .array(z.object({ type: z.nativeEnum(ConsentType), granted: z.boolean() }).strict())
  .min(1)
  .max(10);
export type ConsentsUpdate = z.infer<typeof consentsUpdateSchema>;

export const pushTokenSchema = z
  .object({ token: z.string().min(10).max(300), platform: z.enum(['ios', 'android', 'web']) })
  .strict();
export type PushTokenInput = z.infer<typeof pushTokenSchema>;
