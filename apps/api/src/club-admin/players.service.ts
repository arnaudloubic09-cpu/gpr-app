import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { addMonths, AdjustmentInput, computeBalance } from '@gpr/core';
import type { AuthUser } from '../auth/auth.types';
import { AuditService } from '../common/audit/audit.service';
import { LedgerService } from '../ledger/ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import { RulesService } from '../rules/rules.service';
import { COUPON_INCLUDE, toCouponView } from '../rewards/rewards.service';

/**
 * Joueurs vus depuis le back-office.
 *  - Admin club : joueurs ayant une activité dans SON club (ou l'ayant choisi comme club principal) ;
 *    solde global mais historique limité à son club ; ajustements plafonnés.
 *  - Super admin : tous les joueurs, historique complet, ajustements sans plafond.
 */
@Injectable()
export class PlayersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly rules: RulesService,
    private readonly audit: AuditService,
  ) {}

  private scopeWhere(clubId: string | null): Prisma.UserWhereInput {
    const base: Prisma.UserWhereInput = { role: Role.PLAYER, anonymizedAt: null };
    if (!clubId) return base;
    return { ...base, OR: [{ favoriteClubId: clubId }, { ledger: { some: { clubId } } }] };
  }

  async list(clubId: string | null, search?: string, limit = 50) {
    const q = search?.trim();
    const where: Prisma.UserWhereInput = {
      AND: [
        this.scopeWhere(clubId),
        q
          ? {
              OR: [
                { email: { contains: q, mode: 'insensitive' } },
                { firstName: { contains: q, mode: 'insensitive' } },
                { lastName: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    };
    const users = await this.prisma.user.findMany({
      where,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: Math.min(limit, 200),
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        lastLoginAt: true,
        createdAt: true,
        favoriteClub: { select: { id: true, name: true } },
      },
    });
    return users;
  }

  private async findInScope(userId: string, clubId: string | null) {
    const user = await this.prisma.user.findFirst({
      where: { AND: [{ id: userId }, this.scopeWhere(clubId)] },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        createdAt: true,
        lastLoginAt: true,
        favoriteClub: { select: { id: true, name: true } },
        externalLinks: { select: { provider: true, linkedAt: true } },
      },
    });
    if (!user) throw new NotFoundException('Joueur introuvable');
    return user;
  }

  async detail(userId: string, clubId: string | null) {
    const user = await this.findInScope(userId, clubId);
    const [balance, entries, coupons] = await Promise.all([
      this.ledger.balance(userId),
      this.prisma.ledgerEntry.findMany({
        where: { userId, ...(clubId ? { clubId } : {}) },
        orderBy: [{ earnedAt: 'desc' }, { createdAt: 'desc' }],
        take: 100,
        include: { club: { select: { id: true, name: true } } },
      }),
      this.prisma.coupon.findMany({
        where: { userId, ...(clubId ? { clubId } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: COUPON_INCLUDE,
      }),
    ]);
    return {
      ...user,
      phone: clubId ? undefined : user.phone, // minimisation : téléphone visible du super admin seulement
      balance,
      transactions: entries.map((e) => ({
        id: e.id,
        type: e.type,
        amount: e.amount,
        reason: e.reason,
        club: e.club,
        earnedAt: e.earnedAt,
        availableAt: e.availableAt,
        createdAt: e.createdAt,
      })),
      coupons: coupons.map(toCouponView),
    };
  }

  /** Ajustement manuel motivé : nouvelle écriture ADJUST (le ledger reste immuable). */
  async adjust(userId: string, clubId: string | null, input: AdjustmentInput, actor: AuthUser) {
    await this.findInScope(userId, clubId);
    const rules = await this.rules.getActive();
    if (actor.role === Role.CLUB_ADMIN && Math.abs(input.amount) > rules.clubAdjustmentMax) {
      throw new ForbiddenException(
        `Un admin club peut ajuster au maximum ${rules.clubAdjustmentMax} points GPR par opération. Contactez le GPR au-delà.`,
      );
    }

    const entry = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
      const now = new Date();
      if (input.amount < 0) {
        const { available } = computeBalance(
          await tx.ledgerEntry.findMany({ where: { userId } }),
          now,
        );
        if (available < -input.amount) {
          throw new UnprocessableEntityException(
            `Retrait impossible : le joueur n'a que ${available} points GPR disponibles`,
          );
        }
      }
      const created = await tx.ledgerEntry.create({
        data: {
          userId,
          type: 'ADJUST',
          amount: input.amount,
          sourceType: 'MANUAL',
          idempotencyKey: `adjust:${randomUUID()}`,
          clubId,
          reason: input.reason,
          authorId: actor.id,
          ruleSetVersion: rules.version,
          earnedAt: now,
          availableAt: now,
          expiresAt: input.amount > 0 ? addMonths(now, rules.expirationMonths) : null,
        },
      });
      await this.audit.log(
        {
          actor: { id: actor.id, role: actor.role },
          action: 'player.points.adjust',
          entityType: 'User',
          entityId: userId,
          clubId,
          after: { amount: input.amount, reason: input.reason, ledgerEntryId: created.id },
        },
        tx,
      );
      return created;
    });
    return { entry, balance: await this.ledger.balance(userId) };
  }
}
