import type { CouponView, RewardView } from '@gpr/core';

const nf = new Intl.NumberFormat('fr-FR');

export const points = (n: number) => `${nf.format(n)} point${Math.abs(n) > 1 ? 's' : ''} GPR`;
export const signedPoints = (n: number) => `${n > 0 ? '+' : ''}${nf.format(n)}`;

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

export const CATEGORY: Record<string, { label: string; icon: string }> = {
  DRINK: { label: 'Boisson', icon: 'beer-outline' },
  SNACK: { label: 'Snacking', icon: 'pizza-outline' },
  EQUIPMENT: { label: 'Matériel', icon: 'tennisball-outline' },
  TOURNAMENT: { label: 'Tournoi', icon: 'trophy-outline' },
  LESSON: { label: 'Cours', icon: 'school-outline' },
};

/** Ce que le joueur obtient, en clair. */
export function rewardValue(r: Pick<RewardView, 'kind' | 'discountValue'>): string {
  if (r.kind === 'DISCOUNT_PERCENT') return `-${r.discountValue} %`;
  if (r.kind === 'DISCOUNT_AMOUNT')
    return `-${((r.discountValue ?? 0) / 100).toLocaleString('fr-FR')} €`;
  return 'Offert';
}

export const COUPON_STATUS: Record<CouponView['status'], string> = {
  ACTIVE: 'À utiliser',
  USED: 'Utilisé',
  EXPIRED: 'Expiré — points remboursés',
  CANCELLED: 'Annulé — points remboursés',
};

export const LEVEL_COLORS: Record<string, string> = {
  BRONZE: '#b45309',
  SILVER: '#64748b',
  GOLD: '#ca8a04',
  PLATINUM: '#0e7490',
};

export const BADGE_ICONS: Record<string, string> = {
  trophy: 'trophy',
  medal: 'medal',
  star: 'star',
  flame: 'flame',
  compass: 'compass',
  calendar: 'calendar',
  sunny: 'sunny',
  moon: 'moon',
  flash: 'flash',
  ribbon: 'ribbon',
  tennisball: 'tennisball',
  people: 'people',
};
