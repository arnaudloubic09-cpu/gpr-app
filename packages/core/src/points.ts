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
