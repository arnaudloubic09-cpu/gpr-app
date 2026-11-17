import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '@prisma/client';
import type { AuthUser } from './auth.types';

export const IS_PUBLIC = 'isPublic';
/** Route accessible sans authentification. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES = 'roles';
/** Rôles autorisés sur la route. Sans ce décorateur, seul l'accès authentifié est exigé. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

export const CLUB_SCOPED = 'clubScoped';
/**
 * La route porte un paramètre `:clubId`. Un CLUB_ADMIN n'y accède que pour SON club ;
 * SUPER_ADMIN accède à tous les clubs ; PLAYER est refusé.
 */
export const ClubScoped = () => SetMetadata(CLUB_SCOPED, true);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);
