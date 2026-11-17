import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Coupon, Prisma, Reward } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { computeBalance, CouponView, RewardView, validateRewardConfig } from '@gpr/core';
import { AnalyticsService } from '../common/analytics/analytics.service';
import { PrismaService } from '../prisma/prisma.service';
import { RulesService } from '../rules/rules.service';
import { generateCouponCode } from './coupon-code';

type CouponWithRelations = Coupon & {
  reward: Pick<Reward, 'id' | 'title' | 'category' | 'kind' | 'discountValue'>;
  club: { id: string; name: string };
  ledgerEntry: { amount: number };
};

export const COUPON_INCLUDE = {
  reward: { select: { id: true, title: true, category: true, kind: true, discountValue: true } },
  club: { select: { id: true, name: true } },
  ledgerEntry: { select: { amount: true } },
} as const;

export function toCouponView(c: CouponWithRelations): CouponView {
  return {
    id: c.id,
    code: c.code,
    status: c.status,
    costGpr: -c.ledgerEntry.amount,
    expiresAt: c.expiresAt.toISOString(),
    usedAt: c.usedAt?.toISOString() ?? null,
    closedAt: c.closedAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    reward: c.reward,
    club: c.club,
  };
}

function isOnSale(r: Reward, now: Date) {
  return r.isActive && (!r.startsAt || r.startsAt <= now) && (!r.endsAt || r.endsAt > now);
}

@Injectable()
export class RewardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: RulesService,
    private readonly analytics: AnalyticsService,
  ) {}

  /** Catalogue d'un club : récompenses actives et dans leur période. */
  async catalog(clubId: string, now = new Date()): Promise<RewardView[]> {
    const club = await this.prisma.club.findFirst({ where: { id: clubId, isActive: true } });
    if (!club) throw new NotFoundException('Club introuvable');
    const rewards = await this.prisma.reward.findMany({
      where: {
        clubId,
        isActive: true,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
      },
      orderBy: [{ costGpr: 'asc' }, { title: 'asc' }],
    });
    return rewards.map((r) => ({
      id: r.id,
      clubId: r.clubId,
      category: r.category,
      kind: r.kind,
      title: r.title,
      description: r.description,
      costGpr: r.costGpr,
      discountValue: r.discountValue,
      stock: r.stock,
      available: r.stock === null || r.stock > 0,
      endsAt: r.endsAt?.toISOString() ?? null,
    }));
  }

  /**
   * Échange de points GPR contre une récompense → coupon à usage unique.
   * Garanties :
   *  - verrou sur le compte du joueur : deux échanges simultanés ne dépensent pas deux fois les mêmes points ;
   *  - `requestId` : un double appui renvoie le même coupon ;
   *  - catégories interdites (partie de padel) impossibles : enum + CHECK SQL + validation ci-dessous.
   */
  async redeem(userId: string, rewardId: string, requestId: string): Promise<CouponView> {
    const key = `redeem:${userId}:${requestId}`;
    const existing = await this.findByRedeemKey(key);
    if (existing) return existing;

    try {
      const coupon = await this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
          const replay = await tx.ledgerEntry.findUnique({
            where: { idempotencyKey: key },
            select: { coupon: { select: { id: true } } },
          });
          if (replay?.coupon) return replay.coupon.id;

          const now = new Date();
          const reward = await tx.reward.findUnique({
            where: { id: rewardId },
            include: { club: true },
          });
          if (!reward || !reward.club.isActive || !isOnSale(reward, now)) {
            throw new NotFoundException('Cette récompense n’est plus disponible');
          }
          if (validateRewardConfig(reward).length) {
            throw new UnprocessableEntityException('Cette récompense ne peut pas être échangée');
          }

          const balance = computeBalance(await tx.ledgerEntry.findMany({ where: { userId } }), now);
          if (balance.available < reward.costGpr) {
            throw new UnprocessableEntityException({
              code: 'INSUFFICIENT_BALANCE',
              message: `Solde insuffisant : ${balance.available} points GPR disponibles, ${reward.costGpr} nécessaires`,
              available: balance.available,
            });
          }

          if (reward.stock !== null) {
            const dec = await tx.reward.updateMany({
              where: { id: reward.id, stock: { gt: 0 } },
              data: { stock: { decrement: 1 } },
            });
            if (dec.count === 0)
              throw new ConflictException({ code: 'OUT_OF_STOCK', message: 'Rupture de stock' });
          }

          const rules = await this.rules.getActive();
          const couponId = randomUUID();
          const entry = await tx.ledgerEntry.create({
            data: {
              userId,
              type: 'REDEEM',
              amount: -reward.costGpr,
              sourceType: 'REDEMPTION',
              sourceId: couponId,
              idempotencyKey: key,
              clubId: reward.clubId,
              ruleSetVersion: rules.version,
              earnedAt: now,
              availableAt: now,
            },
          });
          await tx.coupon.create({
            data: {
              id: couponId,
              code: generateCouponCode(),
              userId,
              rewardId: reward.id,
              clubId: reward.clubId,
              ledgerEntryId: entry.id,
              expiresAt: new Date(now.getTime() + rules.couponValidityDays * 86_400_000),
            },
          });
          return couponId;
        },
        { timeout: 10_000 },
      );
      const view = await this.couponById(coupon);
      await this.analytics.track('reward.redeemed', {
        userId,
        clubId: view.club.id,
        payload: { rewardId, category: view.reward.category, cost: view.costGpr },
      });
      return view;
    } catch (e) {
      // Même requestId envoyé deux fois en parallèle : on renvoie le coupon créé par l'autre requête.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const again = await this.findByRedeemKey(key);
        if (again) return again;
      }
      throw e;
    }
  }

  private async findByRedeemKey(key: string): Promise<CouponView | null> {
    const entry = await this.prisma.ledgerEntry.findUnique({
      where: { idempotencyKey: key },
      select: { coupon: { select: { id: true } } },
    });
    return entry?.coupon ? this.couponById(entry.coupon.id) : null;
  }

  private async couponById(id: string): Promise<CouponView> {
    return toCouponView(
      await this.prisma.coupon.findUniqueOrThrow({ where: { id }, include: COUPON_INCLUDE }),
    );
  }
}
