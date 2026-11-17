import * as prisma from '@prisma/client';
import * as core from '@gpr/core';

/** Les enums partagés (packages/core) doivent rester identiques à ceux du schéma Prisma. */
describe('Alignement des enums core ↔ Prisma', () => {
  const names = [
    'Role',
    'BookingProvider',
    'BookingStatus',
    'LedgerType',
    'LedgerSourceType',
    'RewardCategory',
    'RewardKind',
    'CouponStatus',
    'ConsentType',
  ] as const;

  it.each(names)('%s', (name) => {
    const fromPrisma = Object.values((prisma as Record<string, object>)[name]).sort();
    const fromCore = Object.values((core as unknown as Record<string, object>)[name]).sort();
    expect(fromCore).toEqual(fromPrisma);
  });
});
