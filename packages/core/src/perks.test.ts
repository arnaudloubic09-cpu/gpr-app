import { describe, expect, it } from 'vitest';
import { applicablePerks, levelPerkInputSchema, parseCounterCode } from './perks';
import { DEFAULT_GPR_RULES } from './rules';

const levels = DEFAULT_GPR_RULES.levels;
const perk = (
  id: string,
  levelCode: string,
  category: string,
  discountPercent: number,
  isActive = true,
) => ({
  id,
  levelCode,
  category,
  discountPercent,
  label: `${id}`,
  isActive,
});

describe('applicablePerks', () => {
  const perks = [
    perk('silver-shop', 'SILVER', 'EQUIPMENT', 5),
    perk('gold-shop', 'GOLD', 'EQUIPMENT', 10),
    perk('gold-tournoi', 'GOLD', 'TOURNAMENT', 10),
    perk('plat-shop', 'PLATINUM', 'EQUIPMENT', 15),
    perk('off', 'SILVER', 'DRINK', 20, false),
  ];

  it('un joueur Bronze n’a aucun avantage', () => {
    expect(applicablePerks(perks, 'BRONZE', levels)).toEqual([]);
  });
  it('Argent : avantages Argent uniquement', () => {
    expect(applicablePerks(perks, 'SILVER', levels).map((p) => p.id)).toEqual(['silver-shop']);
  });
  it('Or : cumul des niveaux inférieurs, meilleure réduction par catégorie', () => {
    expect(
      applicablePerks(perks, 'GOLD', levels)
        .map((p) => p.id)
        .sort(),
    ).toEqual(['gold-shop', 'gold-tournoi']);
  });
  it('Platine : -15 % shop remplace -10 %', () => {
    expect(applicablePerks(perks, 'PLATINUM', levels).map((p) => p.id)).toEqual([
      'plat-shop',
      'gold-tournoi',
    ]);
  });
  it('ignore les avantages désactivés', () => {
    expect(applicablePerks(perks, 'PLATINUM', levels).some((p) => p.id === 'off')).toBe(false);
  });
});

describe('levelPerkInputSchema', () => {
  it('refuse une réduction sur une partie de padel ou supérieure à 50 %', () => {
    expect(
      levelPerkInputSchema.safeParse({
        levelCode: 'GOLD',
        category: 'BOOKING',
        discountPercent: 10,
        label: 'x partie',
      }).success,
    ).toBe(false);
    expect(
      levelPerkInputSchema.safeParse({
        levelCode: 'GOLD',
        category: 'EQUIPMENT',
        discountPercent: 60,
        label: 'trop',
      }).success,
    ).toBe(false);
    expect(
      levelPerkInputSchema.safeParse({
        levelCode: 'GOLD',
        category: 'TOURNAMENT',
        discountPercent: 10,
        label: '-10 % tournois',
      }).success,
    ).toBe(true);
  });
});

describe('parseCounterCode', () => {
  it('distingue coupon et carte de membre', () => {
    expect(parseCounterCode('GPR-7K4M-Q2XD')).toEqual({ kind: 'coupon', code: 'GPR-7K4M-Q2XD' });
    expect(parseCounterCode('gprm 7k4m q2xd')).toEqual({ kind: 'member', code: 'GPRM-7K4M-Q2XD' });
    expect(parseCounterCode('GPR-M7K4-Q2XD')).toEqual({ kind: 'coupon', code: 'GPR-M7K4-Q2XD' });
    expect(parseCounterCode('bonjour')).toBeNull();
  });
  it('corrige une carte scannée par une douchette réglée en QWERTY (GPRM → GPR?)', () => {
    expect(parseCounterCode('GPR?)è_é(),Q,W')).toEqual({ kind: 'member', code: 'GPRM-7825-MAMZ' });
  });
});
