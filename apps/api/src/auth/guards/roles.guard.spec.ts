import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { CLUB_SCOPED, IS_PUBLIC, ROLES } from '../decorators';
import { RolesGuard } from './roles.guard';

const CLUB_A = '11111111-1111-1111-1111-111111111111';
const CLUB_B = '22222222-2222-2222-2222-222222222222';

function ctx(user: unknown, params: Record<string, string> = {}): ExecutionContext {
  return {
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => ({ user, params }) }),
  } as unknown as ExecutionContext;
}

function guardWith(meta: Record<string, unknown>) {
  const reflector = { getAllAndOverride: (key: string) => meta[key] } as unknown as Reflector;
  return new RolesGuard(reflector);
}

const player = { id: 'p', role: Role.PLAYER, clubId: null };
const adminA = { id: 'a', role: Role.CLUB_ADMIN, clubId: CLUB_A };
const superAdmin = { id: 's', role: Role.SUPER_ADMIN, clubId: null };

describe('RolesGuard', () => {
  it('laisse passer les routes publiques', () => {
    expect(guardWith({ [IS_PUBLIC]: true }).canActivate(ctx(undefined))).toBe(true);
  });

  it('refuse un rôle non autorisé', () => {
    const guard = guardWith({ [ROLES]: [Role.SUPER_ADMIN] });
    expect(() => guard.canActivate(ctx(adminA))).toThrow(ForbiddenException);
    expect(guard.canActivate(ctx(superAdmin))).toBe(true);
  });

  describe('périmètre club', () => {
    const guard = guardWith({ [ROLES]: [Role.SUPER_ADMIN, Role.CLUB_ADMIN], [CLUB_SCOPED]: true });

    it('un admin club accède à son club', () => {
      expect(guard.canActivate(ctx(adminA, { clubId: CLUB_A }))).toBe(true);
    });
    it('un admin club ne voit pas un autre club', () => {
      expect(() => guard.canActivate(ctx(adminA, { clubId: CLUB_B }))).toThrow(ForbiddenException);
    });
    it('le super admin accède à tous les clubs', () => {
      expect(guard.canActivate(ctx(superAdmin, { clubId: CLUB_B }))).toBe(true);
    });
    it('un joueur est refusé même sans restriction de rôle', () => {
      const scopedOnly = guardWith({ [CLUB_SCOPED]: true });
      expect(() => scopedOnly.canActivate(ctx(player, { clubId: CLUB_A }))).toThrow(
        ForbiddenException,
      );
    });
  });
});
