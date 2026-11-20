import type { LedgerType } from './enums';

/**
 * Lecture du grand livre (ledger) — fonctions pures.
 *
 * Les points ne sont utilisables que dans le club où ils ont été gagnés : chaque club forme
 * un solde séparé (voir `splitByClub`).
 *
 * Le solde n'est jamais stocké : il est recalculé à partir des écritures immuables.
 *  - « en attente » : écriture dont availableAt est dans le futur (crédit à H+2) ;
 *  - expiration FIFO : chaque gain forme un « lot » qui expire à expiresAt ;
 *    les rachats consomment d'abord les lots qui expirent le plus tôt ;
 *  - une annulation (REVERSAL) ou une expiration (EXPIRE) vise un lot précis ;
 *  - un remboursement (REFUND, coupon annulé ou non utilisé) restitue exactement les lots
 *    consommés par le rachat d'origine, avec leurs dates d'expiration d'origine.
 */

export interface LedgerEntryLike {
  id: string;
  type: LedgerType;
  amount: number;
  earnedAt: Date;
  availableAt: Date;
  expiresAt: Date | null;
  createdAt: Date;
  /** Pour REVERSAL : l'écriture annulée. Pour REFUND : le rachat (REDEEM) remboursé. */
  reversesEntryId?: string | null;
  /** Pour EXPIRE : l'identifiant du lot expiré. */
  sourceId?: string | null;
  /** Club où les points ont été gagnés (ou dépensés). */
  clubId?: string | null;
}

export interface Lot {
  entryId: string;
  initial: number;
  remaining: number;
  availableAt: Date;
  expiresAt: Date | null;
}

export interface Allocation {
  lots: Lot[];
  /** Points GPR dépensés au-delà du solde (cas rare : partie annulée après un rachat). */
  deficit: number;
}

const POSITIVE_TYPES: LedgerType[] = ['EARN', 'BONUS', 'CHALLENGE'];

const byCreation = (a: LedgerEntryLike, b: LedgerEntryLike) =>
  a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);

function isLot(e: LedgerEntryLike): boolean {
  return POSITIVE_TYPES.includes(e.type) || (e.type === 'ADJUST' && e.amount > 0);
}

/** Rejoue le ledger dans l'ordre d'écriture et répartit chaque débit sur les lots. */
export function allocateLots(entries: LedgerEntryLike[]): Allocation {
  const lots = new Map<string, Lot>();
  let deficit = 0;

  /** Pour chaque débit FIFO : les lots consommés (utilisé par les remboursements). */
  const consumption = new Map<string, { lotId: string; amount: number }[]>();

  const consumeFifo = (amount: number, at: Date, debitId?: string) => {
    let left = amount;
    const taken: { lotId: string; amount: number }[] = [];
    const eligible = [...lots.values()]
      .filter((l) => l.remaining > 0 && l.availableAt <= at && (!l.expiresAt || l.expiresAt > at))
      .sort(
        (a, b) =>
          (a.expiresAt?.getTime() ?? Infinity) - (b.expiresAt?.getTime() ?? Infinity) ||
          a.availableAt.getTime() - b.availableAt.getTime(),
      );
    for (const lot of eligible) {
      if (left === 0) break;
      const take = Math.min(lot.remaining, left);
      lot.remaining -= take;
      left -= take;
      if (take > 0) taken.push({ lotId: lot.entryId, amount: take });
    }
    deficit += left;
    if (debitId) consumption.set(debitId, taken);
  };

  const refund = (redeemId: string | null | undefined, amount: number) => {
    let left = amount;
    for (const t of (redeemId && consumption.get(redeemId)) || []) {
      const lot = lots.get(t.lotId)!;
      const back = Math.min(t.amount, left);
      lot.remaining += back;
      left -= back;
    }
    // Part éventuellement non rattachable à un lot : réduit d'abord un déficit.
    deficit = Math.max(0, deficit - left);
  };

  const consumeLot = (lotId: string | null | undefined, amount: number, at: Date) => {
    const lot = lotId ? lots.get(lotId) : undefined;
    const take = lot ? Math.min(lot.remaining, amount) : 0;
    if (lot) lot.remaining -= take;
    // Si le lot a déjà été dépensé, le reste est pris sur les autres lots.
    if (amount - take > 0) consumeFifo(amount - take, at);
  };

  for (const e of [...entries].sort(byCreation)) {
    if (isLot(e)) {
      // Un nouveau gain rembourse d'abord un éventuel déficit.
      const repay = Math.min(deficit, e.amount);
      deficit -= repay;
      lots.set(e.id, {
        entryId: e.id,
        initial: e.amount,
        remaining: e.amount - repay,
        availableAt: e.availableAt,
        expiresAt: e.expiresAt,
      });
      continue;
    }
    if (e.type === 'REFUND') {
      refund(e.reversesEntryId, e.amount);
      continue;
    }
    const debit = -e.amount;
    if (e.type === 'REVERSAL') consumeLot(e.reversesEntryId, debit, e.createdAt);
    else if (e.type === 'EXPIRE') consumeLot(e.sourceId, debit, e.createdAt);
    else consumeFifo(debit, e.createdAt, e.id); // REDEEM, ADJUST négatif
  }

  return { lots: [...lots.values()], deficit };
}

export interface ExpirationDue {
  lotEntryId: string;
  amount: number;
  /** Nombre d'expirations déjà écrites pour ce lot (sert à la clé d'idempotence). */
  sequence: number;
}

/** Lots arrivés à expiration avec un reste non dépensé : écritures EXPIRE à créer. */
export function computeExpirations(entries: LedgerEntryLike[], now: Date): ExpirationDue[] {
  const expiredCount = new Map<string, number>();
  for (const e of entries) {
    if (e.type === 'EXPIRE' && e.sourceId)
      expiredCount.set(e.sourceId, (expiredCount.get(e.sourceId) ?? 0) + 1);
  }
  return allocateLots(entries)
    .lots.filter((l) => l.remaining > 0 && l.expiresAt && l.expiresAt <= now)
    .map((l) => ({
      lotEntryId: l.entryId,
      amount: l.remaining,
      sequence: expiredCount.get(l.entryId) ?? 0,
    }));
}

export interface Balance {
  /** Points GPR utilisables maintenant. */
  available: number;
  /** Points GPR gagnés mais pas encore validés (H+2). */
  pending: number;
  /** Points GPR qui expireront dans la fenêtre demandée. */
  expiringSoon: number;
}

export function computeBalance(
  entries: LedgerEntryLike[],
  now: Date,
  expiringWithinDays = 30,
): Balance {
  const { lots, deficit } = allocateLots(entries);
  const horizon = new Date(now.getTime() + expiringWithinDays * 86_400_000);

  let available = 0;
  let pending = 0;
  let expiringSoon = 0;
  for (const lot of lots) {
    if (lot.remaining <= 0) continue;
    // Un lot expiré mais pas encore traité par la tâche d'expiration n'est déjà plus utilisable.
    if (lot.expiresAt && lot.expiresAt <= now) continue;
    if (lot.availableAt > now) {
      pending += lot.remaining;
      continue;
    }
    available += lot.remaining;
    if (lot.expiresAt && lot.expiresAt <= horizon) expiringSoon += lot.remaining;
  }
  return { available: available - deficit, pending, expiringSoon };
}

// ───────────── Soldes par club ─────────────

/**
 * Club d'une écriture. Les annulations, remboursements et expirations anciens, écrits sans club,
 * héritent du club de l'écriture qu'ils visent.
 */
export function resolveClubIds<T extends LedgerEntryLike>(
  entries: T[],
): Map<string, string | null> {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const out = new Map<string, string | null>();
  const resolve = (e: T, depth = 0): string | null => {
    if (out.has(e.id)) return out.get(e.id)!;
    let club = e.clubId ?? null;
    if (!club && depth < 5) {
      const refId =
        e.type === 'EXPIRE'
          ? e.sourceId
          : e.type === 'REVERSAL' || e.type === 'REFUND'
            ? e.reversesEntryId
            : null;
      const ref = refId ? byId.get(refId) : undefined;
      if (ref) club = resolve(ref, depth + 1);
    }
    out.set(e.id, club);
    return club;
  };
  for (const e of entries) resolve(e);
  return out;
}

/** Sépare le grand livre par club (clé null : anciennes écritures sans club, non utilisables). */
export function splitByClub<T extends LedgerEntryLike>(entries: T[]): Map<string | null, T[]> {
  const clubs = resolveClubIds(entries);
  const out = new Map<string | null, T[]>();
  for (const e of entries) {
    const k = clubs.get(e.id) ?? null;
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push(e);
  }
  return out;
}

export interface ClubBalance extends Balance {
  clubId: string;
}

/** Solde de chaque club où le joueur a des points (écritures sans club ignorées). */
export function computeClubBalances(
  entries: LedgerEntryLike[],
  now: Date,
  expiringWithinDays = 30,
): ClubBalance[] {
  const out: ClubBalance[] = [];
  for (const [clubId, list] of splitByClub(entries)) {
    if (!clubId) continue;
    out.push({ clubId, ...computeBalance(list, now, expiringWithinDays) });
  }
  return out;
}

/** Solde utilisable dans un club donné. */
export function computeClubBalance(entries: LedgerEntryLike[], clubId: string, now: Date): Balance {
  return computeBalance(splitByClub(entries).get(clubId) ?? [], now);
}

/** Ajoute des mois calendaires (utilisé pour la date d'expiration des gains). */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}
