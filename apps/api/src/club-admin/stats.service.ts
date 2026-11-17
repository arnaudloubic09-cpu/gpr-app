import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const sum = (v: { _sum: { amount: number | null } }) => v._sum.amount ?? 0;

/** Statistiques du back-office (club et groupement). */
@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  private since(days: number) {
    return new Date(Date.now() - days * 86_400_000);
  }

  private async pointsFor(where: Prisma.LedgerEntryWhereInput) {
    const agg = (types: Prisma.LedgerEntryWhereInput['type']) =>
      this.prisma.ledgerEntry.aggregate({
        where: { ...where, type: types },
        _sum: { amount: true },
      });
    const [earned, bonus, reversed, redeemed, refunded, adjusted, expired] = await Promise.all([
      agg('EARN'),
      agg('BONUS'),
      agg('REVERSAL'),
      agg('REDEEM'),
      agg('REFUND'),
      agg('ADJUST'),
      agg('EXPIRE'),
    ]);
    return {
      /** Points GPR distribués (gains + bonus − annulations). */
      distributed: sum(earned) + sum(bonus) + sum(reversed),
      offPeakBonus: sum(bonus),
      /** Points GPR dépensés en récompenses (rachats − remboursements). */
      redeemed: -(sum(redeemed) + sum(refunded)),
      adjusted: sum(adjusted),
      expired: -sum(expired),
    };
  }

  async club(clubId: string, days: number) {
    const since = this.since(days);
    const [points, activePlayers, bookings, couponsByStatus, used, topRewards, series] =
      await Promise.all([
        this.pointsFor({ clubId, earnedAt: { gte: since } }),
        this.prisma.ledgerEntry
          .findMany({
            where: { clubId, type: 'EARN', earnedAt: { gte: since } },
            distinct: ['userId'],
            select: { userId: true },
          })
          .then((r) => r.length),
        this.prisma.booking.groupBy({
          by: ['status'],
          where: { clubId, startsAt: { gte: since } },
          _count: true,
        }),
        this.prisma.coupon.groupBy({
          by: ['status'],
          where: { clubId, createdAt: { gte: since } },
          _count: true,
        }),
        this.prisma.coupon.count({ where: { clubId, status: 'USED', usedAt: { gte: since } } }),
        this.prisma.coupon.groupBy({
          by: ['rewardId'],
          where: { clubId, createdAt: { gte: since }, status: { notIn: ['CANCELLED', 'EXPIRED'] } },
          _count: true,
          orderBy: { _count: { rewardId: 'desc' } },
          take: 5,
        }),
        this.dailySeries(clubId, since),
      ]);
    const rewards = await this.prisma.reward.findMany({
      where: { id: { in: topRewards.map((t) => t.rewardId) } },
      select: { id: true, title: true },
    });
    return {
      periodDays: days,
      activePlayers,
      points,
      bookings: Object.fromEntries(bookings.map((b) => [b.status, b._count])),
      coupons: {
        ...Object.fromEntries(couponsByStatus.map((c) => [c.status, c._count])),
        validated: used,
      },
      topRewards: topRewards.map((t) => ({
        rewardId: t.rewardId,
        title: rewards.find((r) => r.id === t.rewardId)?.title ?? '—',
        count: t._count,
      })),
      series,
    };
  }

  /** Points distribués et dépensés par jour (heure de Paris). */
  private async dailySeries(clubId: string | null, since: Date) {
    const rows = await this.prisma.$queryRaw<
      { day: string; distributed: bigint; redeemed: bigint }[]
    >`
      SELECT to_char(date_trunc('day', "earnedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Paris'), 'YYYY-MM-DD') AS day,
             COALESCE(SUM(amount) FILTER (WHERE type IN ('EARN','BONUS','REVERSAL')), 0) AS distributed,
             COALESCE(-SUM(amount) FILTER (WHERE type IN ('REDEEM','REFUND')), 0) AS redeemed
      FROM "LedgerEntry"
      WHERE "earnedAt" >= ${since} AND (${clubId}::uuid IS NULL OR "clubId" = ${clubId}::uuid)
      GROUP BY 1 ORDER BY 1`;
    return rows.map((r) => ({
      day: r.day,
      distributed: Number(r.distributed),
      redeemed: Number(r.redeemed),
    }));
  }

  /** Vue groupement : totaux et flux de points entre clubs. */
  async global(days: number) {
    const since = this.since(days);
    const [points, players, newPlayers, activePlayers, clubs] = await Promise.all([
      this.pointsFor({ earnedAt: { gte: since } }),
      this.prisma.user.count({ where: { role: 'PLAYER', anonymizedAt: null } }),
      this.prisma.user.count({ where: { role: 'PLAYER', createdAt: { gte: since } } }),
      this.prisma.ledgerEntry
        .findMany({
          where: { type: 'EARN', earnedAt: { gte: since } },
          distinct: ['userId'],
          select: { userId: true },
        })
        .then((r) => r.length),
      this.prisma.club.findMany({
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          isActive: true,
          connector: { select: { lastSyncStatus: true, lastSyncAt: true } },
        },
      }),
    ]);
    const perClub = await Promise.all(
      clubs.map(async (c) => {
        const p = await this.pointsFor({ clubId: c.id, earnedAt: { gte: since } });
        return {
          club: { id: c.id, name: c.name, isActive: c.isActive },
          sync: c.connector,
          distributed: p.distributed,
          redeemed: p.redeemed,
          /** > 0 : le club génère plus de points qu'il n'en absorbe en récompenses. */
          net: p.distributed - p.redeemed,
        };
      }),
    );
    return {
      periodDays: days,
      players: { total: players, new: newPlayers, active: activePlayers },
      points,
      perClub,
      series: await this.dailySeries(null, since),
    };
  }
}
