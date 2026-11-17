import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import type { AuthUser } from '../auth.types';
import { CLUB_SCOPED, IS_PUBLIC, ROLES } from '../decorators';

/**
 * Guard global de contrôle d'accès :
 *  1. rôle autorisé (@Roles) ;
 *  2. périmètre club (@ClubScoped) : un CLUB_ADMIN ne voit que son club.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const user: AuthUser | undefined = req.user;
    if (!user) throw new ForbiddenException();

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, targets);
    if (roles && !roles.includes(user.role)) throw new ForbiddenException();

    if (this.reflector.getAllAndOverride<boolean>(CLUB_SCOPED, targets)) {
      const clubId: string | undefined = req.params?.clubId;
      if (!clubId) throw new ForbiddenException();
      if (user.role === Role.SUPER_ADMIN) return true;
      if (user.role === Role.CLUB_ADMIN && user.clubId === clubId) return true;
      throw new ForbiddenException();
    }
    return true;
  }
}
