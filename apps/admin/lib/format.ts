const nf = new Intl.NumberFormat('fr-FR');
export const n = (v: number) => nf.format(v);
export const dateTime = (iso: string | Date | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('fr-FR', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'Europe/Paris',
      })
    : '—';
export const date = (iso: string | Date | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }) : '—';

export const CATEGORY_LABELS: Record<string, string> = {
  DRINK: 'Boisson',
  SNACK: 'Snacking',
  EQUIPMENT: 'Matériel',
  TOURNAMENT: 'Tournoi',
  LESSON: 'Cours (réduction uniquement)',
};
export const KIND_LABELS: Record<string, string> = {
  FREE_ITEM: 'Offert',
  DISCOUNT_PERCENT: 'Réduction en %',
  DISCOUNT_AMOUNT: 'Réduction en €',
};
export function rewardValue(r: { kind: string; discountValue: number | null }) {
  if (r.kind === 'DISCOUNT_PERCENT') return `-${r.discountValue} %`;
  if (r.kind === 'DISCOUNT_AMOUNT')
    return `-${((r.discountValue ?? 0) / 100).toLocaleString('fr-FR')} €`;
  return 'Offert';
}
export const LEDGER_LABELS: Record<string, string> = {
  EARN: 'Partie jouée',
  BONUS: 'Bonus heures creuses',
  CHALLENGE: 'Défi',
  REDEEM: 'Récompense échangée',
  REFUND: 'Coupon remboursé',
  EXPIRE: 'Expiration',
  REVERSAL: 'Annulation de partie',
  ADJUST: 'Ajustement manuel',
};
export const COUPON_LABELS: Record<string, string> = {
  ACTIVE: 'À utiliser',
  USED: 'Utilisé',
  EXPIRED: 'Expiré (remboursé)',
  CANCELLED: 'Annulé (remboursé)',
};
export const PROVIDER_LABELS: Record<string, string> = {
  PLAYTOMIC: 'Playtomic',
  DOINSPORT: 'Doinsport',
  MOCK: 'Simulé (démo)',
};
export const PERIODS = [
  { value: '7d', label: '7 jours' },
  { value: '30d', label: '30 jours' },
  { value: '90d', label: '90 jours' },
  { value: '365d', label: '12 mois' },
];
