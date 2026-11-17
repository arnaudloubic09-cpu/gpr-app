import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import type { AccessTokenPayload, AuthUser } from '../auth.types';
import { IS_PUBLIC } from '../decorators';

/**
 * Guard global : vérifie le JWT d'accès puis recharge l'utilisateur en base
 * (un compte anonymisé ou dont le rôle a changé est pris en compte immédiatement).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException();

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(header.slice(7));
    } catch {
      throw new UnauthorizedException();
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, clubId: true, anonymizedAt: true },
    });
    if (!user || user.anonymizedAt) throw new UnauthorizedException();

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      clubId: user.clubId,
    };
    req.user = authUser;
    return true;
  }
}
