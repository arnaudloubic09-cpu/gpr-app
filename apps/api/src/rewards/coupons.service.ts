import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CouponStatus, Prisma } from '@prisma/client';
import { CouponView } from '@gpr/core';
import { AnalyticsService } from '../common/analytics/analytics.service';
import { PrismaService } from '../prisma/prisma.service';
import { COUPON_INCLUDE, toCouponView } from './rewards.service';

@Injectable()
export class CouponsService {
  private readonly logger = new Logger(CouponsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
  ) {}

  async listForUser(userId: string, scope: 'active' | 'history'): Promise<CouponView[]> {
    const coupons = await this.prisma.coupon.findMany({
      where: { userId, status: scope === 'active' ? 'ACTIVE' : { not: 'ACTIVE' } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: COUPON_INCLUDE,
    });
    return coupons.map(toCouponView);
  }

  /** Annulation par le joueur d'un coupon non utilisé : points GPR remboursés immédiatement. */
  async cancelByPlayer(userId: string, couponId: string): Promise<CouponView> {
    const closed = await this.closeWithRefund(couponId, 'CANCELLED', { userId });
    if (!closed) throw new NotFoundException('Coupon introuvable ou déjà utilisé');
    return closed;
  }

  /** Coupons arrivés à expiration sans avoir été utilisés : remboursement automatique. */
  async expireDue(now = new Date()): Promise<number> {
    const due = await this.prisma.coupon.findMany({
      where: { status: 'ACTIVE', expiresAt: { lte: now } },
      select: { id: true },
      take: 1000,
    });
    let count = 0;
    for (const c of due) if (await this.closeWithRefund(c.id, 'EXPIRED', {}, now)) count++;
    if (count) this.logger.log(`${count} coupon(s) expiré(s) et remboursé(s)`);
    return count;
  }

  /**
   * Clôt un coupon ACTIF et rembourse les points (écriture REFUND unique, clé `refund:<coupon>`).
   * Renvoie null si le coupon n'est plus actif (déjà utilisé, annulé ou expiré).
   */
  private async closeWithRefund(
    couponId: string,
    status: Extract<CouponStatus, 'CANCELLED' | 'EXPIRED'>,
    where: Prisma.CouponWhereInput,
    now = new Date(),
  ): Promise<CouponView | null> {
    const id = await this.prisma.$transaction(async (tx) => {
      const res = await tx.coupon.updateMany({
        where: { ...where, id: couponId, status: 'ACTIVE' },
        data: { status, closedAt: now },
      });
      if (res.count === 0) return null;
      const coupon = await tx.coupon.findUniqueOrThrow({
        where: { id: couponId },
        include: { ledgerEntry: true, reward: true },
      });
      await tx.ledgerEntry.create({
        data: {
          userId: coupon.userId,
          type: 'REFUND',
          amount: -coupon.ledgerEntry.amount,
          sourceType: 'REDEMPTION',
          sourceId: coupon.id,
          reversesEntryId: coupon.ledgerEntryId,
          idempotencyKey: `refund:${coupon.id}`,
          clubId: coupon.clubId,
          reason:
            status === 'EXPIRED'
              ? 'Coupon non utilisé dans le délai'
              : 'Coupon annulé par le joueur',
          earnedAt: now,
          availableAt: now,
        },
      });
      if (coupon.reward.stock !== null) {
        await tx.reward.update({
          where: { id: coupon.rewardId },
          data: { stock: { increment: 1 } },
        });
      }
      return coupon.id;
    });
    if (!id) return null;
    const view = toCouponView(
      await this.prisma.coupon.findUniqueOrThrow({ where: { id }, include: COUPON_INCLUDE }),
    );
    await this.analytics.track(status === 'EXPIRED' ? 'coupon.expired' : 'coupon.cancelled', {
      clubId: view.club.id,
      payload: { couponId: id, refunded: view.costGpr },
    });
    return view;
  }
}
