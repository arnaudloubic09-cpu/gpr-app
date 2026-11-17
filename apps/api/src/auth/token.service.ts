import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AuthTokens } from '@gpr/core';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessTokenPayload } from './auth.types';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/**
 * JWT d'accès court + refresh token opaque à rotation.
 * Rejouer un refresh token déjà utilisé révoque toute sa famille (détection de vol).
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async issue(
    user: Pick<User, 'id' | 'role' | 'clubId'>,
    familyId: string = randomUUID(),
  ): Promise<AuthTokens> {
    const expiresIn = this.config.get('JWT_ACCESS_TTL_SECONDS', { infer: true });
    const payload: AccessTokenPayload = { sub: user.id, role: user.role, clubId: user.clubId };
    const accessToken = await this.jwt.signAsync(payload, { expiresIn });

    const refreshToken = randomBytes(32).toString('base64url');
    const ttlDays = this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + ttlDays * 86_400_000),
      },
    });
    return { accessToken, refreshToken, expiresIn };
  }

  async rotate(refreshToken: string): Promise<AuthTokens> {
    const invalid = new UnauthorizedException('Session expirée');
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { user: true },
    });
    if (!stored) throw invalid;

    if (stored.usedAt || stored.revokedAt) {
      await this.revokeFamily(stored.familyId);
      throw invalid;
    }
    if (stored.expiresAt <= new Date() || stored.user.anonymizedAt) throw invalid;

    const marked = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, usedAt: null, revokedAt: null },
      data: { usedAt: new Date() },
    });
    if (marked.count === 0) {
      await this.revokeFamily(stored.familyId);
      throw invalid;
    }
    return this.issue(stored.user, stored.familyId);
  }

  async revoke(refreshToken: string): Promise<void> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
    });
    if (stored) await this.revokeFamily(stored.familyId);
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
