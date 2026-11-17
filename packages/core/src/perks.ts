import { z } from 'zod';
import { fixScannerLayout } from './coupon-code';
import { RewardCategory } from './enums';
import type { LevelThreshold } from './rules';

/**
 * Avantages de niveau : réductions permanentes accordées par un club à ses membres
 * à partir d'un niveau (ex. Or : -10 % sur le shop). Jamais sur une partie de padel :
 * seules les catégories de récompenses autorisées sont possibles.
 */
export const levelPerkInputSchema = z
  .object({
    levelCode: z.string().regex(/^[A-Z_]{2,20}$/),
    category: z.nativeEnum(RewardCategory),
    discountPercent: z.number().int().min(1).max(50),
    label: z.string().trim().min(3).max(80),
    isActive: z.boolean().optional(),
  })
  .strict();
export type LevelPerkInput = z.infer<typeof levelPerkInputSchema>;

export interface PerkLike {
  id: string;
  levelCode: string;
  category: string;
  discountPercent: number;
  label: string;
  isActive: boolean;
}

const rank = (levels: LevelThreshold[], code: string) =>
  [...levels].sort((a, b) => a.minGpr - b.minGpr).findIndex((l) => l.code === code);

/**
 * Avantages dont bénéficie un joueur : ceux de son niveau et des niveaux inférieurs ;
 * pour une même catégorie, seule la meilleure réduction est retenue.
 */
export function applicablePerks<T extends PerkLike>(
  perks: T[],
  levelCode: string,
  levels: LevelThreshold[],
): T[] {
  const mine = rank(levels, levelCode);
  const best = new Map<string, T>();
  for (const p of perks) {
    const r = rank(levels, p.levelCode);
    if (!p.isActive || r === -1 || r > mine) continue;
    const current = best.get(p.category);
    if (!current || p.discountPercent > current.discountPercent) best.set(p.category, p);
  }
  return [...best.values()].sort((a, b) => b.discountPercent - a.discountPercent);
}

// ───────────── Codes présentés au comptoir ─────────────

/** Coupon : GPR-XXXX-XXXX · Carte de membre : GPRM-XXXX-XXXX. */
export type CounterCode = { kind: 'coupon'; code: string } | { kind: 'member'; code: string };

export function parseCounterCode(raw: string): CounterCode | null {
  const n = fixScannerLayout(raw.trim())
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (/^GPRM[A-Z0-9]{8}$/.test(n))
    return { kind: 'member', code: `GPRM-${n.slice(4, 8)}-${n.slice(8)}` };
  if (/^GPR[A-Z0-9]{8}$/.test(n))
    return { kind: 'coupon', code: `GPR-${n.slice(3, 7)}-${n.slice(7)}` };
  if (/^[A-Z0-9]{8}$/.test(n))
    return { kind: 'coupon', code: `GPR-${n.slice(0, 4)}-${n.slice(4)}` };
  return null;
}
