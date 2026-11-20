import { z } from 'zod';

/** Réglages de la carte VIP (super admin). */
export const vipSettingsBase = z.object({
  /** Carte VIP visible et utilisable par les joueurs. Désactivée tant que les partenariats ne sont pas prêts. */
  enabled: z.boolean(),
  /** Nombre de parties à jouer dans les clubs du GPR sur 12 mois glissants pour être VIP (gratuit). */
  gamesRequired: z.number().int().min(1).max(500),
});
export const vipSettingsSchema = vipSettingsBase.strict();
export type VipSettings = z.infer<typeof vipSettingsSchema>;

export const DEFAULT_VIP_SETTINGS: VipSettings = {
  enabled: false,
  gamesRequired: 10,
};

/** Fenêtre glissante de la carte VIP. */
export const VIP_WINDOW_DAYS = 365;

export const partnerInputSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    offer: z.string().trim().min(3).max(120),
    description: z.string().trim().max(500).nullable().optional(),
    websiteUrl: z.string().trim().url().max(300).nullable().optional(),
    maxCodesPerMember: z.number().int().min(1).max(1000).nullable().optional(),
    codeValidityDays: z.number().int().min(1).max(365).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type PartnerInput = z.infer<typeof partnerInputSchema>;

/** Import d'une liste de codes : un code par ligne (ou séparés par des virgules / points-virgules). */
export const partnerCodesImportSchema = z
  .object({ codes: z.string().min(1).max(500_000) })
  .strict();

export function parseCodeList(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[\n\r,;\t]+/)
        .map((c) => c.trim())
        .filter((c) => c.length >= 3 && c.length <= 100),
    ),
  ];
}

export const vipGrantSchema = z
  .object({
    months: z.number().int().min(1).max(36).default(12),
    reason: z.string().trim().min(5).max(300),
  })
  .strict();
export type VipGrantInput = z.infer<typeof vipGrantSchema>;

export const VIP_LOW_STOCK_THRESHOLD = 20;
