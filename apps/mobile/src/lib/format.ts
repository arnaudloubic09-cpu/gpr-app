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

/** Couleur de chaque niveau (cadre du solde, carte de membre) ; texte blanc lisible sur chacune. */
export const LEVEL_COLORS: Record<string, string> = {
  BRONZE: '#9a5b2e',
  SILVER: '#6b7280',
  GOLD: '#a16207',
  PLATINUM: '#334155',
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

/** Points utilisables dans un club (les points ne servent que dans le club où ils ont été gagnés). */
export const clubAvailable = (
  balance: { clubs: { club: { id: string }; available: number }[] } | null | undefined,
  clubId: string | null | undefined,
) => balance?.clubs.find((c) => c.club.id === clubId)?.available ?? 0;
