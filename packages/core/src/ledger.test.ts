import { describe, expect, it } from 'vitest';
import {
  addMonths,
  allocateLots,
  computeBalance,
  computeExpirations,
  type LedgerEntryLike,
} from './ledger';

let seq = 0;
const d = (s: string) => new Date(s);

function earn(amount: number, at: string, opts: Partial<LedgerEntryLike> = {}): LedgerEntryLike {
  const earnedAt = d(at);
  return {
    id: `e${++seq}`,
    type: 'EARN',
    amount,
    earnedAt,
    availableAt: new Date(earnedAt.getTime() + 2 * 3600_000),
    expiresAt: addMonths(earnedAt, 12),
    createdAt: earnedAt,
    ...opts,
  };
}

function debit(
  type: 'REDEEM' | 'REVERSAL' | 'EXPIRE' | 'ADJUST',
  amount: number,
  at: string,
  opts: Partial<LedgerEntryLike> = {},
): LedgerEntryLike {
  const t = d(at);
  return {
    id: `d${++seq}`,
    type,
    amount: -amount,
    earnedAt: t,
    availableAt: t,
    expiresAt: null,
    createdAt: t,
    ...opts,
  };
}

describe('computeBalance', () => {
  it('distingue les points en attente (H+2) des points disponibles', () => {
    const entries = [earn(20, '2026-11-17T10:00:00Z'), earn(30, '2026-11-17T18:00:00Z')];
    expect(computeBalance(entries, d('2026-11-17T19:00:00Z'))).toMatchObject({
      available: 20,
      pending: 30,
    });
    expect(computeBalance(entries, d('2026-11-17T20:00:01Z'))).toMatchObject({
      available: 50,
      pending: 0,
    });
  });

  it('une annulation d’une partie encore en attente ne touche pas le solde disponible', () => {
    const e = earn(30, '2026-11-17T18:00:00Z');
    const r = debit('REVERSAL', 30, '2026-11-17T19:00:00Z', { reversesEntryId: e.id });
    expect(
      computeBalance([earn(20, '2026-11-01T10:00:00Z'), e, r], d('2026-11-17T19:30:00Z')),
    ).toMatchObject({
      available: 20,
      pending: 0,
    });
  });

  it('exclut immédiatement un lot expiré, même avant le passage de la tâche d’expiration', () => {
    const entries = [earn(40, '2025-10-01T10:00:00Z'), earn(10, '2026-11-01T10:00:00Z')];
    expect(computeBalance(entries, d('2026-11-17T00:00:00Z')).available).toBe(10);
  });

  it('signale les points qui expirent dans les 30 jours', () => {
    const entries = [earn(40, '2025-12-01T10:00:00Z'), earn(10, '2026-11-01T10:00:00Z')];
    expect(computeBalance(entries, d('2026-11-17T00:00:00Z'))).toMatchObject({
      available: 50,
      expiringSoon: 40,
    });
  });
});

describe('expiration FIFO', () => {
  it('un rachat consomme d’abord les points les plus anciens', () => {
    const old = earn(50, '2025-12-01T10:00:00Z');
    const recent = earn(50, '2026-06-01T10:00:00Z');
    const redeem = debit('REDEEM', 60, '2026-07-01T10:00:00Z');
    const { lots } = allocateLots([old, recent, redeem]);
    expect(lots.find((l) => l.entryId === old.id)!.remaining).toBe(0);
    expect(lots.find((l) => l.entryId === recent.id)!.remaining).toBe(40);
  });

  it('expire seulement le reste non dépensé d’un lot, 12 mois après le gain', () => {
    const old = earn(50, '2025-11-01T10:00:00Z');
    const redeem = debit('REDEEM', 30, '2026-03-01T10:00:00Z');
    expect(computeExpirations([old, redeem], d('2026-10-31T00:00:00Z'))).toEqual([]);
    expect(computeExpirations([old, redeem], d('2026-11-02T00:00:00Z'))).toEqual([
      { lotEntryId: old.id, amount: 20, sequence: 0 },
    ]);
  });

  it('une expiration déjà écrite n’est pas recalculée (idempotence)', () => {
    const old = earn(50, '2025-11-01T10:00:00Z');
    const exp = debit('EXPIRE', 50, '2026-11-02T00:00:00Z', { sourceId: old.id });
    expect(computeExpirations([old, exp], d('2026-11-17T00:00:00Z'))).toEqual([]);
    expect(computeBalance([old, exp], d('2026-11-17T00:00:00Z')).available).toBe(0);
  });

  it('un rachat ne peut pas consommer des points en attente', () => {
    const pendingEarn = earn(50, '2026-11-17T18:00:00Z');
    const { deficit } = allocateLots([pendingEarn, debit('REDEEM', 20, '2026-11-17T18:30:00Z')]);
    expect(deficit).toBe(20);
  });

  it('partie annulée après un rachat : déficit remboursé par les gains suivants', () => {
    const e = earn(30, '2026-11-01T10:00:00Z');
    const redeem = debit('REDEEM', 30, '2026-11-02T10:00:00Z');
    const reversal = debit('REVERSAL', 30, '2026-11-03T10:00:00Z', { reversesEntryId: e.id });
    expect(computeBalance([e, redeem, reversal], d('2026-11-04T00:00:00Z')).available).toBe(-30);
    const later = earn(50, '2026-11-05T10:00:00Z');
    expect(computeBalance([e, redeem, reversal, later], d('2026-11-06T00:00:00Z')).available).toBe(
      20,
    );
  });
});

describe('remboursement d’un coupon (REFUND)', () => {
  it('restitue les points sur les lots d’origine, avec leur date d’expiration', () => {
    const old = earn(50, '2025-12-01T10:00:00Z');
    const recent = earn(50, '2026-06-01T10:00:00Z');
    const redeem = debit('REDEEM', 80, '2026-07-01T10:00:00Z');
    const refund: LedgerEntryLike = {
      ...earn(80, '2026-07-02T10:00:00Z'),
      type: 'REFUND',
      reversesEntryId: redeem.id,
      expiresAt: null,
    };
    const { lots } = allocateLots([old, recent, redeem, refund]);
    expect(lots.find((l) => l.entryId === old.id)!.remaining).toBe(50);
    expect(lots.find((l) => l.entryId === recent.id)!.remaining).toBe(50);
    expect(lots.some((l) => l.entryId === refund.id)).toBe(false);
    expect(computeBalance([old, recent, redeem, refund], d('2026-07-03T00:00:00Z')).available).toBe(
      100,
    );
  });

  it('un lot restitué après sa date d’expiration expire à nouveau (nouvelle séquence)', () => {
    const lot = earn(50, '2025-11-01T10:00:00Z');
    const redeem = debit('REDEEM', 50, '2026-10-30T10:00:00Z');
    const refund: LedgerEntryLike = {
      ...earn(50, '2026-11-05T10:00:00Z'),
      type: 'REFUND',
      reversesEntryId: redeem.id,
      expiresAt: null,
    };
    const due = computeExpirations([lot, redeem, refund], d('2026-11-06T00:00:00Z'));
    expect(due).toEqual([{ lotEntryId: lot.id, amount: 50, sequence: 0 }]);
  });
});
