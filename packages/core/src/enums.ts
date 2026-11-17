/**
 * Enums partagés. Ils reflètent exactement les enums du schéma Prisma
 * (apps/api/prisma/schema.prisma) : un test vérifie qu'ils restent alignés.
 */

export const Role = {
  PLAYER: 'PLAYER',
  CLUB_ADMIN: 'CLUB_ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const BookingProvider = {
  PLAYTOMIC: 'PLAYTOMIC',
  DOINSPORT: 'DOINSPORT',
  MOCK: 'MOCK',
} as const;
export type BookingProvider = (typeof BookingProvider)[keyof typeof BookingProvider];

export const BookingStatus = {
  CONFIRMED: 'CONFIRMED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'NO_SHOW',
} as const;
export type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];

/** Types de transactions du grand livre (ledger). */
export const LedgerType = {
  EARN: 'EARN',
  BONUS: 'BONUS',
  CHALLENGE: 'CHALLENGE',
  REDEEM: 'REDEEM',
  EXPIRE: 'EXPIRE',
  REVERSAL: 'REVERSAL',
  ADJUST: 'ADJUST',
} as const;
export type LedgerType = (typeof LedgerType)[keyof typeof LedgerType];

export const LedgerSourceType = {
  BOOKING: 'BOOKING',
  CHALLENGE: 'CHALLENGE',
  REDEMPTION: 'REDEMPTION',
  EXPIRATION: 'EXPIRATION',
  MANUAL: 'MANUAL',
} as const;
export type LedgerSourceType = (typeof LedgerSourceType)[keyof typeof LedgerSourceType];

/**
 * Catégories de récompenses autorisées. Il n'existe volontairement AUCUNE
 * catégorie « réservation » ou « partie de padel » : la règle métier
 * « pas de points contre une partie » est garantie par construction
 * (enum Postgres + contrainte CHECK + validation serveur).
 */
export const RewardCategory = {
  DRINK: 'DRINK',
  SNACK: 'SNACK',
  EQUIPMENT: 'EQUIPMENT',
  TOURNAMENT: 'TOURNAMENT',
  LESSON: 'LESSON',
} as const;
export type RewardCategory = (typeof RewardCategory)[keyof typeof RewardCategory];

export const RewardKind = {
  FREE_ITEM: 'FREE_ITEM',
  DISCOUNT_PERCENT: 'DISCOUNT_PERCENT',
  DISCOUNT_AMOUNT: 'DISCOUNT_AMOUNT',
} as const;
export type RewardKind = (typeof RewardKind)[keyof typeof RewardKind];

export const CouponStatus = {
  ACTIVE: 'ACTIVE',
  USED: 'USED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
} as const;
export type CouponStatus = (typeof CouponStatus)[keyof typeof CouponStatus];

export const OtpAudience = {
  MOBILE: 'MOBILE',
  ADMIN: 'ADMIN',
} as const;
export type OtpAudience = (typeof OtpAudience)[keyof typeof OtpAudience];

export const ConsentType = {
  TERMS: 'TERMS',
  PUSH_NOTIFICATIONS: 'PUSH_NOTIFICATIONS',
  MARKETING_EMAIL: 'MARKETING_EMAIL',
  ANALYTICS: 'ANALYTICS',
} as const;
export type ConsentType = (typeof ConsentType)[keyof typeof ConsentType];
