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
  dailyCapPerPlayer: number;
  pendingDelayMinutes: number;
  expirationMonths: number;
  offPeakMultiplier: number;
  offPeakWindows: OffPeakWindow[];
  levels: LevelThreshold[];
}

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];

export const DEFAULT_GPR_RULES: GprRules = {
  pointsPerSlot: 10,
  slotMinutes: 30,
  dailyCapPerPlayer: 60,
  pendingDelayMinutes: 120,
  expirationMonths: 12,
  offPeakMultiplier: 2,
  offPeakWindows: [
    { days: ALL_DAYS, start: '00:00', end: '12:00' },
    { days: ALL_DAYS, start: '14:00', end: '17:00' },
  ],
  levels: [
    { code: 'BRONZE', label: 'Bronze', minGpr: 0 },
    { code: 'SILVER', label: 'Argent', minGpr: 500 },
    { code: 'GOLD', label: 'Or', minGpr: 1500 },
    { code: 'PLATINUM', label: 'Platine', minGpr: 3000 },
  ],
};
