import type { GprRules, OffPeakWindow } from './rules';

/**
 * Calcul des points GPR d'une partie — fonction pure, sans base de données.
 *
 * Règles validées avec le client :
 *  - points au prorata du temps joué : pointsPerSlot points GPR par tranche de slotMinutes,
 *    arrondi à l'entier inférieur (75 min → 25 points GPR avec 10 / 30 min) ;
 *  - bonus heures creuses (si le club l'a activé) au prorata des minutes passées
 *    dans une plage d'heures creuses, à l'heure locale du club ;
 *  - pas de plafond journalier tant que dailyCapPerPlayer est null.
 */

export interface BookingForPoints {
  startsAt: Date;
  endsAt: Date;
  /** Fuseau IANA du club, ex. "Europe/Paris". */
  timezone: string;
  offPeakBonusEnabled: boolean;
}

export interface BookingPoints {
  totalMinutes: number;
  offPeakMinutes: number;
  /** Points GPR de base (sans bonus). */
  basePoints: number;
  /** Points GPR supplémentaires dus au bonus heures creuses. */
  bonusPoints: number;
  totalPoints: number;
}

export type PointsRules = Pick<
  GprRules,
  'pointsPerSlot' | 'slotMinutes' | 'offPeakMultiplier' | 'offPeakWindows'
>;

const MINUTE = 60_000;
const ISO_DAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  let f = formatters.get(timezone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timezone, f);
  }
  return f;
}

/** Jour ISO (1 = lundi) et minute du jour, à l'heure locale du fuseau donné. */
export function localDayAndMinute(
  date: Date,
  timezone: string,
): { isoDay: number; minuteOfDay: number } {
  const parts = formatterFor(timezone).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    isoDay: ISO_DAY[get('weekday')],
    minuteOfDay: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export function isOffPeak(date: Date, timezone: string, windows: OffPeakWindow[]): boolean {
  const { isoDay, minuteOfDay } = localDayAndMinute(date, timezone);
  return windows.some(
    (w) =>
      w.days.includes(isoDay) &&
      minuteOfDay >= toMinutes(w.start) &&
      minuteOfDay < toMinutes(w.end),
  );
}

export function computeBookingPoints(booking: BookingForPoints, rules: PointsRules): BookingPoints {
  const totalMinutes = Math.floor((booking.endsAt.getTime() - booking.startsAt.getTime()) / MINUTE);
  if (totalMinutes <= 0) {
    return { totalMinutes: 0, offPeakMinutes: 0, basePoints: 0, bonusPoints: 0, totalPoints: 0 };
  }

  // Minute par minute : exact aux bornes des plages et lors des changements d'heure.
  let offPeakMinutes = 0;
  if (booking.offPeakBonusEnabled && rules.offPeakMultiplier > 1) {
    for (let i = 0; i < totalMinutes; i++) {
      const t = new Date(booking.startsAt.getTime() + i * MINUTE);
      if (isOffPeak(t, booking.timezone, rules.offPeakWindows)) offPeakMinutes++;
    }
  }

  // Calcul en entiers (multiplicateur au centième) pour éviter les erreurs d'arrondi flottant.
  const multiplier100 = Math.round(rules.offPeakMultiplier * 100);
  const weighted100 = (totalMinutes - offPeakMinutes) * 100 + offPeakMinutes * multiplier100;
  const totalPoints = Math.floor((rules.pointsPerSlot * weighted100) / (rules.slotMinutes * 100));
  const basePoints = Math.floor((rules.pointsPerSlot * totalMinutes) / rules.slotMinutes);

  return {
    totalMinutes,
    offPeakMinutes,
    basePoints,
    bonusPoints: totalPoints - basePoints,
    totalPoints,
  };
}

// ───────────── Anti-abus : temps de jeu crédité ─────────────

export interface Interval {
  start: Date;
  end: Date;
}

const minutesOf = (i: Interval) =>
  Math.max(0, Math.floor((i.end.getTime() - i.start.getTime()) / MINUTE));

/** Fusionne des intervalles qui se chevauchent ou se touchent. */
export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = [...list]
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) {
      if (i.end > last.end) last.end = new Date(i.end.getTime());
    } else out.push({ start: new Date(i.start.getTime()), end: new Date(i.end.getTime()) });
  }
  return out;
}

/**
 * Portion créditable d'une partie, compte tenu des parties déjà créditées le même jour :
 *  - le temps qui chevauche une partie déjà créditée n'est pas recompté ;
 *  - le total crédité dans la journée ne dépasse pas `dailyMaxMinutes` (les premières minutes jouées comptent).
 */
export function creditableIntervals(
  booking: Interval,
  alreadyCredited: Interval[],
  dailyMaxMinutes: number | null,
): Interval[] {
  const credited = mergeIntervals(alreadyCredited);
  // 1. Retrait des chevauchements
  let pieces: Interval[] = [{ ...booking }];
  for (const c of credited) {
    pieces = pieces.flatMap((p) => {
      if (c.end <= p.start || c.start >= p.end) return [p];
      const parts: Interval[] = [];
      if (c.start > p.start) parts.push({ start: p.start, end: c.start });
      if (c.end < p.end) parts.push({ start: c.end, end: p.end });
      return parts;
    });
  }
  pieces = pieces.filter((p) => minutesOf(p) > 0);
  if (dailyMaxMinutes === null) return pieces;
  // 2. Plafond journalier
  let remaining = Math.max(0, dailyMaxMinutes - credited.reduce((s, c) => s + minutesOf(c), 0));
  const out: Interval[] = [];
  for (const p of pieces) {
    if (remaining <= 0) break;
    const m = Math.min(minutesOf(p), remaining);
    out.push({ start: p.start, end: new Date(p.start.getTime() + m * MINUTE) });
    remaining -= m;
  }
  return out;
}

/** Points GPR d'un ensemble d'intervalles (prorata et heures creuses, arrondi une seule fois). */
export function computeIntervalsPoints(
  intervals: Interval[],
  ctx: { timezone: string; offPeakBonusEnabled: boolean },
  rules: PointsRules,
): BookingPoints {
  let totalMinutes = 0;
  let offPeakMinutes = 0;
  for (const i of intervals) {
    const r = computeBookingPoints({ startsAt: i.start, endsAt: i.end, ...ctx }, rules);
    totalMinutes += r.totalMinutes;
    offPeakMinutes += r.offPeakMinutes;
  }
  const multiplier100 = Math.round(rules.offPeakMultiplier * 100);
  const weighted100 = (totalMinutes - offPeakMinutes) * 100 + offPeakMinutes * multiplier100;
  const totalPoints = Math.floor((rules.pointsPerSlot * weighted100) / (rules.slotMinutes * 100));
  const basePoints = Math.floor((rules.pointsPerSlot * totalMinutes) / rules.slotMinutes);
  return {
    totalMinutes,
    offPeakMinutes,
    basePoints,
    bonusPoints: totalPoints - basePoints,
    totalPoints,
  };
}

/** Jour local (AAAA-MM-JJ) d'une date, pour le plafond journalier. */
export function localDayKey(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
