import { describe, expect, it } from 'vitest';
import { validateRewardConfig } from './rewards';

describe('validateRewardConfig', () => {
  it('accepte une bière offerte', () => {
    expect(validateRewardConfig({ category: 'DRINK', kind: 'FREE_ITEM', costGpr: 100 })).toEqual(
      [],
    );
  });

  it('refuse toute catégorie liée à une réservation ou une partie de padel', () => {
    for (const category of ['BOOKING', 'COURT', 'PADEL_GAME', 'MATCH', 'drink']) {
      expect(
        validateRewardConfig({
          category,
          kind: 'DISCOUNT_PERCENT',
          costGpr: 100,
          discountValue: 10,
        }),
      ).toContain('CATEGORY_NOT_ALLOWED');
    }
  });

  it('autorise une réduction sur un cours mais jamais un cours gratuit', () => {
    expect(
      validateRewardConfig({
        category: 'LESSON',
        kind: 'DISCOUNT_PERCENT',
        costGpr: 300,
        discountValue: 20,
      }),
    ).toEqual([]);
    expect(validateRewardConfig({ category: 'LESSON', kind: 'FREE_ITEM', costGpr: 300 })).toContain(
      'DISCOUNT_ONLY_CATEGORY',
    );
  });

  it('valide les montants de réduction', () => {
    expect(
      validateRewardConfig({
        category: 'EQUIPMENT',
        kind: 'DISCOUNT_PERCENT',
        costGpr: 50,
        discountValue: 150,
      }),
    ).toContain('INVALID_DISCOUNT_VALUE');
    expect(
      validateRewardConfig({
        category: 'EQUIPMENT',
        kind: 'DISCOUNT_AMOUNT',
        costGpr: 50,
        discountValue: 500,
      }),
    ).toEqual([]);
    expect(
      validateRewardConfig({ category: 'SNACK', kind: 'FREE_ITEM', costGpr: 50, discountValue: 5 }),
    ).toContain('INVALID_DISCOUNT_VALUE');
  });

  it('refuse un coût nul, négatif ou décimal', () => {
    for (const costGpr of [0, -10, 12.5]) {
      expect(validateRewardConfig({ category: 'SNACK', kind: 'FREE_ITEM', costGpr })).toContain(
        'INVALID_COST',
      );
    }
  });
});

import { STANDARD_CATALOG } from './rewards';
describe('catalogue type GPR', () => {
  it('ne contient que des récompenses valides (aucune partie de padel, cours en réduction)', () => {
    for (const r of STANDARD_CATALOG) expect(validateRewardConfig(r)).toEqual([]);
  });
});
