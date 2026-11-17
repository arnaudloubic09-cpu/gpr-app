import { z } from 'zod';
import { BookingProvider, RewardCategory, RewardKind } from './enums';
import { validateRewardConfig } from './rewards';
import { emailSchema } from './schemas';

/** Création / modification d'une récompense par un club. */
export const rewardInputSchema = z
  .object({
    category: z.nativeEnum(RewardCategory),
    kind: z.nativeEnum(RewardKind),
    title: z.string().trim().min(3).max(80),
    description: z.string().trim().max(500).nullable().optional(),
    costGpr: z.number().int().positive().max(100_000),
    discountValue: z.number().int().positive().nullable().optional(),
    stock: z.number().int().min(0).max(100_000).nullable().optional(),
    startsAt: z.coerce.date().nullable().optional(),
    endsAt: z.coerce.date().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .superRefine((r, ctx) => {
    for (const code of validateRewardConfig({ ...r, discountValue: r.discountValue ?? null })) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: code });
    }
    if (r.startsAt && r.endsAt && r.endsAt <= r.startsAt) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endsAt'], message: 'END_BEFORE_START' });
    }
  });
export type RewardInput = z.infer<typeof rewardInputSchema>;

export const adjustmentSchema = z
  .object({
    amount: z
      .number()
      .int()
      .refine((n) => n !== 0, 'Montant non nul requis'),
    reason: z.string().trim().min(5, 'Motif obligatoire (5 caractères minimum)').max(300),
  })
  .strict();
export type AdjustmentInput = z.infer<typeof adjustmentSchema>;

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** Nouvelle version des règles GPR (super admin). */
export const ruleSetInputSchema = z
  .object({
    pointsPerSlot: z.number().int().min(1).max(1000),
    slotMinutes: z.number().int().min(5).max(240),
    /** Plafond journalier : non implémenté à ce jour, doit rester null. */
    dailyCapPerPlayer: z.null(),
    pendingDelayMinutes: z
      .number()
      .int()
      .min(0)
      .max(7 * 24 * 60),
    expirationMonths: z.number().int().min(1).max(60),
    couponValidityDays: z.number().int().min(1).max(365),
    clubAdjustmentMax: z.number().int().min(0).max(100_000),
    offPeakMultiplier: z.number().min(1).max(5),
    offPeakWindows: z
      .array(
        z
          .object({ days: z.array(z.number().int().min(1).max(7)).min(1), start: hhmm, end: hhmm })
          .refine((w) => w.end > w.start, 'La fin doit être après le début'),
      )
      .max(10),
    levels: z
      .array(
        z.object({
          code: z.string().regex(/^[A-Z_]{2,20}$/),
          label: z.string().min(1).max(30),
          minGpr: z.number().int().min(0),
        }),
      )
      .min(1),
  })
  .strict();
export type RuleSetInput = z.infer<typeof ruleSetInputSchema>;

export const clubInputSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    city: z.string().trim().min(2).max(80),
    timezone: z.string().default('Europe/Paris'),
    isActive: z.boolean().optional(),
  })
  .strict();
export type ClubInput = z.infer<typeof clubInputSchema>;

export const connectorInputSchema = z
  .object({
    provider: z.nativeEnum(BookingProvider),
    externalClubId: z.string().trim().min(1).max(120),
    /** Identifiants en clair : chiffrés à l'enregistrement, jamais renvoyés. Absent = inchangés. */
    credentials: z.record(z.string().max(2000)).optional(),
    syncIntervalMinutes: z
      .number()
      .int()
      .min(5)
      .max(24 * 60),
  })
  .strict();
export type ConnectorInput = z.infer<typeof connectorInputSchema>;

export const adminUserInputSchema = z
  .object({
    email: emailSchema,
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().min(1).max(60),
    role: z.enum(['CLUB_ADMIN', 'SUPER_ADMIN']),
    clubId: z.string().uuid().nullable(),
  })
  .strict()
  .refine((u) => (u.role === 'CLUB_ADMIN') === !!u.clubId, {
    message: 'Un admin club doit être rattaché à un club (et seulement lui)',
    path: ['clubId'],
  });
export type AdminUserInput = z.infer<typeof adminUserInputSchema>;

export const STATS_PERIODS = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 } as const;
export type StatsPeriod = keyof typeof STATS_PERIODS;
