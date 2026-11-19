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

/** Fuseau des clubs : les champs « date et heure » du back-office sont saisis à l'heure de Paris. */
const CLUB_TZ = 'Europe/Paris';
const tzParts = (d: Date) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: CLUB_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return p as Record<string, string>;
};

/** Date → valeur d'un champ datetime-local, à l'heure de Paris (quel que soit le fuseau du serveur). */
export function toParisInput(d: Date): string {
  const p = tzParts(d);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Valeur d'un champ datetime-local saisie à l'heure de Paris → date ISO (UTC). */
export function fromParisInput(local: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return '';
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const offsetAt = (t: number) => {
    const p = tzParts(new Date(t));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - t;
  };
  let t = wall - offsetAt(wall);
  t = wall - offsetAt(t);
  return new Date(t).toISOString();
}
