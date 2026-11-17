import { describe, expect, it } from 'vitest';
import {
  computeLevel,
  describeCondition,
  evaluateChallenge,
  isoWeekKey,
  monthKey,
  type ChallengeDef,
  type PlayedGame,
} from './gamification';
import type { LedgerEntryLike } from './ledger';
import { DEFAULT_GPR_RULES } from './rules';

const ctx = { offPeakWindows: DEFAULT_GPR_RULES.offPeakWindows };
let n = 0;
/** Partie en heure de Paris (novembre = UTC+1). */
const game = (local: string, minutes = 90, clubId = 'A'): PlayedGame => {
  const startsAt = new Date(`${local}:00+01:00`);
  return {
    bookingId: `b${++n}`,
    clubId,
    startsAt,
    endsAt: new Date(startsAt.getTime() + minutes * 60_000),
  };
};
const def = (
  condition: unknown,
  period: ChallengeDef['period'] = 'WEEK',
  clubId: string | null = null,
): ChallengeDef => ({
  id: 'c',
  clubId,
  condition,
  period,
  startsAt: new Date('2026-01-01T00:00:00Z'),
  endsAt: null,
});

// 2026-11-16 = lundi (semaine 47), 2026-11-22 = dimanche, 2026-11-23 = lundi (semaine 48)
describe('périodes', () => {
  it('semaine ISO en heure de Paris (du lundi au dimanche)', () => {
    expect(isoWeekKey(new Date('2026-11-16T00:30:00+01:00'))).toBe('2026-W47');
    expect(isoWeekKey(new Date('2026-11-22T23:30:00+01:00'))).toBe('2026-W47');
    expect(isoWeekKey(new Date('2026-11-23T00:10:00+01:00'))).toBe('2026-W48');
    expect(isoWeekKey(new Date('2027-01-01T12:00:00+01:00'))).toBe('2026-W53');
  });
  it('mois en heure de Paris', () => {
    expect(monthKey(new Date('2026-11-30T23:30:00Z'))).toBe('2026-12'); // 00:30 à Paris le 1er décembre
  });
});

describe('evaluateChallenge', () => {
  it('« Jouer 3 fois cette semaine »', () => {
    const c = def({ type: 'COUNT', target: 3 });
    const two = [game('2026-11-16T18:00'), game('2026-11-18T18:00')];
    expect(evaluateChallenge(c, two, '2026-W47', ctx)).toMatchObject({
      value: 2,
      target: 3,
      completed: false,
    });
    const three = [...two, game('2026-11-22T10:00'), game('2026-11-23T10:00')]; // la 4e est la semaine suivante
    expect(evaluateChallenge(c, three, '2026-W47', ctx)).toMatchObject({
      value: 3,
      completed: true,
    });
    expect(evaluateChallenge(c, three, '2026-W48', ctx)).toMatchObject({
      value: 1,
      completed: false,
    });
  });

  it('« Jouer dans 2 clubs différents ce mois-ci »', () => {
    const c = def({ type: 'DISTINCT_CLUBS', target: 2 }, 'MONTH');
    expect(
      evaluateChallenge(
        c,
        [game('2026-11-03T18:00', 90, 'A'), game('2026-11-20T18:00', 90, 'A')],
        '2026-11',
        ctx,
      ).completed,
    ).toBe(false);
    expect(
      evaluateChallenge(
        c,
        [game('2026-11-03T18:00', 90, 'A'), game('2026-11-20T18:00', 90, 'B')],
        '2026-11',
        ctx,
      ).completed,
    ).toBe(true);
  });

  it('« Jouer un lundi matin en heures creuses » (ancien format weekday accepté)', () => {
    const c = def({ type: 'MATCH', weekday: 1, before: '12:00', offPeak: true });
    expect(evaluateChallenge(c, [game('2026-11-16T10:00')], '2026-W47', ctx).completed).toBe(true);
    expect(evaluateChallenge(c, [game('2026-11-16T12:30')], '2026-W47', ctx).completed).toBe(false); // après midi
    expect(evaluateChallenge(c, [game('2026-11-17T10:00')], '2026-W47', ctx).completed).toBe(false); // mardi
  });

  it('« Série de 4 semaines consécutives »', () => {
    const c = def({ type: 'WEEKLY_STREAK', target: 4 }, 'FIXED');
    const gap = [
      game('2026-11-02T18:00'),
      game('2026-11-09T18:00'),
      game('2026-11-23T18:00'),
      game('2026-11-30T18:00'),
    ];
    expect(evaluateChallenge(c, gap, 'FIXED', ctx)).toMatchObject({ value: 2, completed: false });
    const streak = [
      game('2026-11-02T18:00'),
      game('2026-11-11T18:00'),
      game('2026-11-21T18:00'),
      game('2026-11-23T08:00'),
    ];
    expect(evaluateChallenge(c, streak, 'FIXED', ctx)).toMatchObject({ value: 4, completed: true });
  });

  it('temps de jeu cumulé', () => {
    const c = def({ type: 'MINUTES', target: 600 }, 'MONTH');
    const games = Array.from({ length: 6 }, (_, i) =>
      game(`2026-11-${String(i + 2).padStart(2, '0')}T18:00`, 90),
    );
    expect(evaluateChallenge(c, games, '2026-11', ctx)).toMatchObject({
      value: 540,
      completed: false,
    });
    expect(
      evaluateChallenge(c, [...games, game('2026-11-20T18:00', 60)], '2026-11', ctx).completed,
    ).toBe(true);
  });

  it('un défi de club ne compte que les parties jouées dans ce club', () => {
    const c = def({ type: 'COUNT', target: 2 }, 'WEEK', 'A');
    expect(
      evaluateChallenge(
        c,
        [game('2026-11-16T18:00', 90, 'A'), game('2026-11-17T18:00', 90, 'B')],
        '2026-W47',
        ctx,
      ).completed,
    ).toBe(false);
  });

  it('ignore les parties antérieures au lancement du défi', () => {
    const c = { ...def({ type: 'COUNT', target: 1 }), startsAt: new Date('2026-11-18T00:00:00Z') };
    expect(evaluateChallenge(c, [game('2026-11-16T18:00')], '2026-W47', ctx).completed).toBe(false);
  });

  it('décrit l’objectif en clair', () => {
    expect(
      describeCondition({ type: 'MATCH', weekdays: [1], before: '12:00', offPeak: true }),
    ).toBe('Jouer une partie le lundi avant 12 h 00 en heures creuses');
    expect(describeCondition({ type: 'DISTINCT_CLUBS', target: 2 })).toBe(
      'Jouer dans 2 clubs différents du groupement',
    );
  });

  it('refuse une condition invalide', () => {
    expect(() => evaluateChallenge(def({ type: 'BOOKING', target: 1 }), [], 'x', ctx)).toThrow();
  });
});

describe('computeLevel (12 mois glissants)', () => {
  const now = new Date('2026-11-17T12:00:00Z');
  const e = (type: LedgerEntryLike['type'], amount: number, daysAgo: number): LedgerEntryLike => {
    const t = new Date(now.getTime() - daysAgo * 86_400_000);
    return {
      id: `${type}${amount}${daysAgo}`,
      type,
      amount,
      earnedAt: t,
      availableAt: t,
      expiresAt: null,
      createdAt: t,
    };
  };
  const levels = DEFAULT_GPR_RULES.levels;

  it('Bronze au départ, puis Argent à 500 points GPR', () => {
    expect(computeLevel([], now, levels)).toMatchObject({
      current: { code: 'BRONZE' },
      next: { code: 'SILVER' },
      pointsToNext: 500,
    });
    expect(computeLevel([e('EARN', 400, 10), e('BONUS', 100, 5)], now, levels).current.code).toBe(
      'SILVER',
    );
  });

  it('les dépenses ne font pas baisser le niveau, les annulations si', () => {
    const base = [e('EARN', 1600, 30)];
    expect(computeLevel([...base, e('REDEEM', -1000, 1)], now, levels).current.code).toBe('GOLD');
    expect(computeLevel([...base, e('REVERSAL', -200, 1)], now, levels).current.code).toBe(
      'SILVER',
    );
  });

  it('seuls les 12 derniers mois comptent ; les défis comptent', () => {
    expect(computeLevel([e('EARN', 3000, 400), e('CHALLENGE', 50, 1)], now, levels)).toMatchObject({
      points12m: 50,
      current: { code: 'BRONZE' },
    });
  });

  it('Platine : niveau maximal', () => {
    expect(computeLevel([e('EARN', 3500, 20)], now, levels)).toMatchObject({
      current: { code: 'PLATINUM' },
      next: null,
      progress: 1,
    });
  });
});
