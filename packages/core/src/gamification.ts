import { z } from 'zod';
import type { LedgerType } from './enums';
import type { LedgerEntryLike } from './ledger';
import { isOffPeak, localDayAndMinute } from './points';
import type { LevelThreshold, OffPeakWindow } from './rules';

/**
 * Gamification — fonctions pures.
 *
 * Un défi = déclencheur (partie jouée et validée) + condition + période + récompense.
 * Les parties prises en compte sont celles qui ont rapporté des points GPR validés (H+2) :
 * joueur inscrit, compte lié, partie non annulée dans le délai.
 */

export const CHALLENGE_TZ = 'Europe/Paris';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const challengeConditionSchema = z.preprocess(
  // Compatibilité : ancien format { weekday: 1 } → { weekdays: [1] }
  (v) => {
    const o = v as Record<string, unknown> | null;
    if (o && typeof o === 'object' && typeof o.weekday === 'number' && !o.weekdays) {
      const { weekday, ...rest } = o;
      return { ...rest, weekdays: [weekday] };
    }
    return v;
  },
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('COUNT'), target: z.number().int().min(1).max(100) }).strict(),
    z
      .object({ type: z.literal('DISTINCT_CLUBS'), target: z.number().int().min(2).max(50) })
      .strict(),
    z.object({ type: z.literal('MINUTES'), target: z.number().int().min(30).max(10_000) }).strict(),
    z
      .object({ type: z.literal('WEEKLY_STREAK'), target: z.number().int().min(2).max(52) })
      .strict(),
    z
      .object({
        type: z.literal('MATCH'),
        weekdays: z.array(z.number().int().min(1).max(7)).min(1).optional(),
        /** La partie commence avant cette heure (heure locale). */
        before: hhmm.optional(),
        /** La partie commence à partir de cette heure. */
        after: hhmm.optional(),
        /** La partie commence pendant une plage d'heures creuses du GPR. */
        offPeak: z.boolean().optional(),
        target: z.number().int().min(1).max(100).default(1),
      })
      .strict(),
  ]),
);
export type ChallengeCondition = z.infer<typeof challengeConditionSchema>;

export type ChallengePeriod = 'WEEK' | 'MONTH' | 'FIXED';

export interface PlayedGame {
  bookingId: string;
  clubId: string;
  startsAt: Date;
  endsAt: Date;
}

export interface ChallengeDef {
  id: string;
  clubId: string | null;
  condition: unknown;
  period: ChallengePeriod;
  startsAt: Date;
  endsAt: Date | null;
}

export interface EvalContext {
  offPeakWindows: OffPeakWindow[];
}

export interface ChallengeResult {
  periodKey: string;
  value: number;
  target: number;
  completed: boolean;
}

// ───────────── Périodes ─────────────

function localParts(date: Date) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: CHALLENGE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => Number(p.find((x) => x.type === t)!.value);
  return { y: get('year'), m: get('month'), d: get('day') };
}

/** Semaine ISO (lundi → dimanche) en heure de Paris, ex. « 2026-W47 ». */
export function isoWeekKey(date: Date): string {
  const { y, m, d } = localParts(date);
  const t = new Date(Date.UTC(y, m - 1, d));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day); // jeudi de la semaine
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function monthKey(date: Date): string {
  const { y, m } = localParts(date);
  return `${y}-${String(m).padStart(2, '0')}`;
}

export function periodKeyFor(period: ChallengePeriod, date: Date): string {
  if (period === 'WEEK') return isoWeekKey(date);
  if (period === 'MONTH') return monthKey(date);
  return 'FIXED';
}

const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));

function matches(
  game: PlayedGame,
  c: Extract<ChallengeCondition, { type: 'MATCH' }>,
  ctx: EvalContext,
) {
  const { isoDay, minuteOfDay } = localDayAndMinute(game.startsAt, CHALLENGE_TZ);
  if (c.weekdays && !c.weekdays.includes(isoDay)) return false;
  if (c.before && minuteOfDay >= toMin(c.before)) return false;
  if (c.after && minuteOfDay < toMin(c.after)) return false;
  if (c.offPeak && !isOffPeak(game.startsAt, CHALLENGE_TZ, ctx.offPeakWindows)) return false;
  return true;
}

/** Plus longue série de semaines ISO consécutives contenant au moins une partie. */
function longestWeeklyStreak(games: PlayedGame[]): number {
  const weeks = [...new Set(games.map((g) => isoWeekKey(g.startsAt)))]
    .map((k) => {
      // Lundi de la semaine ISO → index de semaine absolu
      const [y, w] = k.split('-W').map(Number);
      const jan4 = new Date(Date.UTC(y, 0, 4));
      const monday = new Date(
        jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * 86_400_000 + (w - 1) * 7 * 86_400_000,
      );
      return Math.round(monday.getTime() / (7 * 86_400_000));
    })
    .sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < weeks.length; i++) {
    run = i > 0 && weeks[i] === weeks[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

/**
 * Évalue un défi pour une période donnée à partir des parties validées du joueur.
 * Les parties hors club (défi de club) ou hors dates du défi sont ignorées.
 */
export function evaluateChallenge(
  challenge: ChallengeDef,
  games: PlayedGame[],
  periodKey: string,
  ctx: EvalContext,
): ChallengeResult {
  const condition = challengeConditionSchema.parse(challenge.condition);
  const eligible = games.filter(
    (g) =>
      (!challenge.clubId || g.clubId === challenge.clubId) &&
      g.startsAt >= challenge.startsAt &&
      (!challenge.endsAt || g.startsAt < challenge.endsAt) &&
      periodKeyFor(challenge.period, g.startsAt) === periodKey,
  );

  let value: number;
  switch (condition.type) {
    case 'COUNT':
      value = eligible.length;
      break;
    case 'DISTINCT_CLUBS':
      value = new Set(eligible.map((g) => g.clubId)).size;
      break;
    case 'MINUTES':
      value = eligible.reduce(
        (s, g) => s + Math.round((g.endsAt.getTime() - g.startsAt.getTime()) / 60_000),
        0,
      );
      break;
    case 'WEEKLY_STREAK':
      value = longestWeeklyStreak(eligible);
      break;
    case 'MATCH':
      value = eligible.filter((g) => matches(g, condition, ctx)).length;
      break;
  }
  const target = condition.target;
  return { periodKey, value: Math.min(value, target), target, completed: value >= target };
}

/** Libellé de l'objectif, pour l'app et le back-office. */
export function describeCondition(raw: unknown): string {
  const c = challengeConditionSchema.parse(raw);
  const days = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  switch (c.type) {
    case 'COUNT':
      return `Jouer ${c.target} partie${c.target > 1 ? 's' : ''}`;
    case 'DISTINCT_CLUBS':
      return `Jouer dans ${c.target} clubs différents du groupement`;
    case 'MINUTES':
      return `Cumuler ${Math.round((c.target / 60) * 10) / 10} h de jeu`;
    case 'WEEKLY_STREAK':
      return `Jouer au moins une fois par semaine, ${c.target} semaines d'affilée`;
    case 'MATCH': {
      const parts = [`Jouer ${c.target > 1 ? `${c.target} parties` : 'une partie'}`];
      if (c.weekdays) parts.push(c.weekdays.map((d) => `le ${days[d]}`).join(' ou '));
      if (c.after) parts.push(`à partir de ${c.after.replace(':', ' h ')}`);
      if (c.before) parts.push(`avant ${c.before.replace(':', ' h ')}`);
      if (c.offPeak) parts.push('en heures creuses');
      return parts.join(' ');
    }
  }
}

export const challengeInputSchema = z
  .object({
    name: z.string().trim().min(3).max(80),
    description: z.string().trim().min(3).max(300),
    period: z.enum(['WEEK', 'MONTH', 'FIXED']),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date().nullable().optional(),
    condition: challengeConditionSchema,
    rewardGpr: z.number().int().min(1).max(100_000).nullable().optional(),
    rewardBadgeId: z.string().uuid().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((c) => !!c.rewardGpr || !!c.rewardBadgeId, {
    message: 'Une récompense (points GPR ou badge) est requise',
  })
  .refine((c) => !c.endsAt || c.endsAt > c.startsAt, {
    message: 'La fin doit être après le début',
    path: ['endsAt'],
  })
  .refine((c) => c.condition.type !== 'WEEKLY_STREAK' || c.period === 'FIXED', {
    message: 'Une série de semaines se mesure sur une période à dates fixes',
    path: ['period'],
  });
export type ChallengeInput = z.infer<typeof challengeInputSchema>;

export const BADGE_ICONS = [
  'trophy',
  'medal',
  'star',
  'flame',
  'compass',
  'calendar',
  'sunny',
  'moon',
  'flash',
  'ribbon',
  'tennisball',
  'people',
] as const;

export const badgeInputSchema = z
  .object({
    code: z.string().regex(/^[A-Z][A-Z0-9_]{1,30}$/, 'Code en majuscules, ex. EXPLORER'),
    name: z.string().trim().min(2).max(40),
    description: z.string().trim().min(3).max(200),
    icon: z.enum(BADGE_ICONS),
  })
  .strict();
export type BadgeInput = z.infer<typeof badgeInputSchema>;

// ───────────── Niveaux ─────────────

const LEVEL_TYPES: LedgerType[] = ['EARN', 'BONUS', 'CHALLENGE', 'REVERSAL'];

export interface LevelStatus {
  /** Points GPR gagnés sur 12 mois glissants (les dépenses ne font pas baisser le niveau). */
  points12m: number;
  current: LevelThreshold;
  next: LevelThreshold | null;
  pointsToNext: number;
  /** Progression vers le niveau suivant, de 0 à 1. */
  progress: number;
}

export function computeLevel(
  entries: LedgerEntryLike[],
  now: Date,
  levels: LevelThreshold[],
): LevelStatus {
  const since = new Date(now.getTime() - 365 * 86_400_000);
  const points12m = Math.max(
    0,
    entries
      .filter(
        (e) =>
          LEVEL_TYPES.includes(e.type) &&
          e.earnedAt > since &&
          e.earnedAt <= now &&
          e.availableAt <= now,
      )
      .reduce((s, e) => s + e.amount, 0),
  );
  const sorted = [...levels].sort((a, b) => a.minGpr - b.minGpr);
  const idx = sorted.reduce((acc, l, i) => (points12m >= l.minGpr ? i : acc), 0);
  const current = sorted[idx];
  const next = sorted[idx + 1] ?? null;
  return {
    points12m,
    current,
    next,
    pointsToNext: next ? next.minGpr - points12m : 0,
    progress: next ? (points12m - current.minGpr) / (next.minGpr - current.minGpr) : 1,
  };
}
