import { z } from 'zod';

/** « Info du moment » publiée par un club (titre + texte court, période d'affichage). */
export const announcementInputSchema = z
  .object({
    title: z.string().trim().min(3).max(60),
    body: z.string().trim().min(3).max(240),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((a) => a.endsAt > a.startsAt, {
    message: 'La fin doit être après le début',
    path: ['endsAt'],
  });
export type AnnouncementInput = z.infer<typeof announcementInputSchema>;

/** Logo transmis en « data URL » base64 (PNG, JPEG ou WebP, 300 Ko max une fois décodé). */
export const LOGO_MAX_BYTES = 300 * 1024;
export const logoDataUrlSchema = z
  .string()
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, 'Logo : PNG, JPEG ou WebP attendu')
  .refine(
    (v) => Math.floor((v.split(',')[1].length * 3) / 4) <= LOGO_MAX_BYTES,
    'Logo trop lourd (300 Ko maximum)',
  );

/** Partenaire local d'un club. `logo` absent = inchangé, null = supprimé. */
export const localPartnerInputSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    offer: z.string().trim().min(3).max(120),
    description: z.string().trim().max(300).nullable().optional(),
    address: z.string().trim().min(5).max(200),
    logo: logoDataUrlSchema.nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type LocalPartnerInput = z.infer<typeof localPartnerInputSchema>;

/** Avantage d'un partenaire local actif si le joueur a joué dans ce club au cours des N derniers jours. */
export const LOCAL_PARTNER_ACTIVITY_DAYS = 30;

/** Lien d'itinéraire universel (Google Maps sur Android et le web, propose Plans sur iPhone). */
export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/** Logo du club (affiché en haut à gauche de son back-office). null = supprimé. */
export const clubLogoInputSchema = z.object({ logo: logoDataUrlSchema.nullable() });
export type ClubLogoInput = z.infer<typeof clubLogoInputSchema>;
