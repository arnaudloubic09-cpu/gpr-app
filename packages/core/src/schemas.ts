import { z } from 'zod';
import { OtpAudience } from './enums';

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

export const clubSettingsSchema = z.object({ offPeakBonusEnabled: z.boolean() }).strict();
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
  role: string;
  clubId: string | null;
}
