import { RewardCategory, RewardKind } from './enums';

export const REWARD_CATEGORY_LABELS: Record<RewardCategory, string> = {
  DRINK: 'Boisson',
  SNACK: 'Snacking',
  EQUIPMENT: 'Matériel',
  TOURNAMENT: 'Inscription tournoi',
  LESSON: 'Cours / coaching (réduction uniquement)',
};

/** Catégories pour lesquelles seule une réduction est permise (jamais d'article gratuit). */
export const DISCOUNT_ONLY_CATEGORIES: readonly RewardCategory[] = [RewardCategory.LESSON];

export interface RewardConfigInput {
  category: string;
  kind: string;
  costGpr: number;
  /** Pourcentage (1-100) pour DISCOUNT_PERCENT, montant en centimes pour DISCOUNT_AMOUNT. */
  discountValue?: number | null;
}

export type RewardConfigError =
  | 'CATEGORY_NOT_ALLOWED'
  | 'KIND_NOT_ALLOWED'
  | 'DISCOUNT_ONLY_CATEGORY'
  | 'INVALID_COST'
  | 'INVALID_DISCOUNT_VALUE';

const CATEGORIES = new Set<string>(Object.values(RewardCategory));
const KINDS = new Set<string>(Object.values(RewardKind));

/**
 * Valide la configuration d'une récompense. Utilisé côté serveur
 * (doublé d'une contrainte CHECK en base). Renvoie la liste des erreurs.
 */
export function validateRewardConfig(input: RewardConfigInput): RewardConfigError[] {
  const errors: RewardConfigError[] = [];
  if (!CATEGORIES.has(input.category)) errors.push('CATEGORY_NOT_ALLOWED');
  if (!KINDS.has(input.kind)) errors.push('KIND_NOT_ALLOWED');
  if (!Number.isInteger(input.costGpr) || input.costGpr <= 0) errors.push('INVALID_COST');

  if (
    DISCOUNT_ONLY_CATEGORIES.includes(input.category as RewardCategory) &&
    input.kind === RewardKind.FREE_ITEM
  ) {
    errors.push('DISCOUNT_ONLY_CATEGORY');
  }

  const v = input.discountValue;
  if (input.kind === RewardKind.FREE_ITEM && v != null) errors.push('INVALID_DISCOUNT_VALUE');
  if (input.kind === RewardKind.DISCOUNT_PERCENT && !(Number.isInteger(v) && v! >= 1 && v! <= 100))
    errors.push('INVALID_DISCOUNT_VALUE');
  if (input.kind === RewardKind.DISCOUNT_AMOUNT && !(Number.isInteger(v) && v! > 0))
    errors.push('INVALID_DISCOUNT_VALUE');

  return errors;
}
