/**
 * Règles GPR définies au niveau du groupement (super admin).
 * Valeurs par défaut validées avec le client ; stockées et versionnées en base (table RuleSet).
 */

export interface OffPeakWindow {
  /** Jours ISO concernés : 1 = lundi … 7 = dimanche. */
  days: number[];
  /** Heure locale du club, format HH:mm (début inclus). */
  start: string;
  /** Heure locale du club, format HH:mm (fin exclue). */
  end: string;
}

export interface LevelThreshold {
  code: string;
  label: string;
  /** GPR cumulés sur 12 mois glissants pour atteindre ce niveau. */
  minGpr: number;
}

export interface GprRules {
  pointsPerSlot: number;
  slotMinutes: number;
  /** Plafond de points GPR par jour et par joueur. null = pas de plafond (choix actuel du GPR). */
  dailyCapPerPlayer: number | null;
  pendingDelayMinutes: number;
  expirationMonths: number;
  /** Durée de validité d'un coupon de récompense, en jours. */
  couponValidityDays: number;
  /** Ajustement manuel maximal (valeur absolue) autorisé à un admin club, en points GPR. */
  clubAdjustmentMax: number;
  offPeakMultiplier: number;
  offPeakWindows: OffPeakWindow[];
  levels: LevelThreshold[];
}

/** Heures creuses du lundi au vendredi (pas le week-end). */
const WEEKDAYS = [1, 2, 3, 4, 5];

export const DEFAULT_GPR_RULES: GprRules = {
  pointsPerSlot: 10,
  slotMinutes: 30,
  dailyCapPerPlayer: null,
  pendingDelayMinutes: 120,
  expirationMonths: 12,
  couponValidityDays: 7,
  clubAdjustmentMax: 200,
  offPeakMultiplier: 2,
  offPeakWindows: [
    { days: WEEKDAYS, start: '00:00', end: '12:00' },
    { days: WEEKDAYS, start: '14:00', end: '17:00' },
  ],
  levels: [
    { code: 'BRONZE', label: 'Bronze', minGpr: 0 },
    { code: 'SILVER', label: 'Argent', minGpr: 500 },
    { code: 'GOLD', label: 'Or', minGpr: 1500 },
    { code: 'PLATINUM', label: 'Platine', minGpr: 3000 },
  ],
};
