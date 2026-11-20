import { Injectable, Logger } from '@nestjs/common';
import { LedgerEntry, LedgerType, Prisma } from '@prisma/client';
import {
  Balance,
  BalanceView,
  computeClubBalance,
  computeClubBalances,
  computeExpirations,
  splitByClub,
} from '@gpr/core';
import { PrismaService } from '../prisma/prisma.service';

const TYPE_LABELS: Record<LedgerType, string> = {
  EARN: 'Partie jouée',
  BONUS: 'Bonus heures creuses',
  CHALLENGE: 'Défi réussi',
  REDEEM: 'Récompense échangée',
  EXPIRE: 'Points GPR expirés',
  REVERSAL: 'Annulation de partie',
  REFUND: 'Coupon remboursé',
  ADJUST: 'Ajustement manuel',
};

export interface TransactionView {
  id: string;
  type: LedgerType;
  label: string;
  amount: number;
  status: 'PENDING' | 'VALIDATED';
  club: { id: string; name: string } | null;
  reason: string | null;
  earnedAt: Date;
  availableAt: Date;
  expiresAt: Date | null;
  createdAt: Date;
}

/** Lecture et maintenance du grand livre. Le solde est toujours recalculé (jamais stocké). */
@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);

  constructor(private readonly prisma: PrismaService) {}

  private entries(
    userId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<LedgerEntry[]> {
    return tx.ledgerEntry.findMany({ where: { userId } });
  }

  /** Solde par club (points utilisables uniquement dans le club où ils ont été gagnés). */
  async balance(userId: string, now = new Date()): Promise<BalanceView> {
    const [entries, user] = await Promise.all([
      this.entries(userId),
      this.prisma.user.findUnique({ where: { id: userId }, select: { favoriteClubId: true } }),
    ]);
    const balances = computeClubBalances(entries, now);
    const clubs = await this.prisma.club.findMany({
      where: { id: { in: balances.map((b) => b.clubId) } },
      select: { id: true, name: true },
    });
    const views = balances
      .map(({ clubId, ...b }) => ({
        club: clubs.find((c) => c.id === clubId) ?? { id: clubId, name: 'Club' },
        favorite: clubId === user?.favoriteClubId,
        ...b,
      }))
      // On n'affiche pas un club où il ne reste plus rien
      .filter((v) => v.available !== 0 || v.pending > 0 || v.favorite)
      .sort(
        (a, b) =>
          Number(b.favorite) - Number(a.favorite) ||
          b.available - a.available ||
          a.club.name.localeCompare(b.club.name),
      );
    return {
      available: views.reduce((s, v) => s + v.available, 0),
      pending: views.reduce((s, v) => s + v.pending, 0),
      expiringSoon: views.reduce((s, v) => s + v.expiringSoon, 0),
      clubs: views,
    };
  }

  /** Solde utilisable dans un club donné. */
  async clubBalance(
    userId: string,
    clubId: string,
    now = new Date(),
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<Balance> {
    return computeClubBalance(await this.entries(userId, tx), clubId, now);
  }

  async transactions(
    userId: string,
    limit = 50,
    cursor?: string,
    now = new Date(),
  ): Promise<{ items: TransactionView[]; nextCursor: string | null }> {
    const rows = await this.prisma.ledgerEntry.findMany({
      where: { userId },
      orderBy: [{ earnedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { club: { select: { id: true, name: true } } },
    });
    const page = rows.slice(0, limit);
    return {
      items: page.map((e) => ({
        id: e.id,
        type: e.type,
        label:
          e.type === 'CHALLENGE' && e.reason ? `Défi réussi : ${e.reason}` : TYPE_LABELS[e.type],
        amount: e.amount,
        status: e.availableAt > now ? 'PENDING' : 'VALIDATED',
        club: e.club,
        reason: e.type === 'ADJUST' ? e.reason : null,
        earnedAt: e.earnedAt,
        availableAt: e.availableAt,
        expiresAt: e.expiresAt,
        createdAt: e.createdAt,
      })),
      nextCursor: rows.length > limit ? page[page.length - 1].id : null,
    };
  }

  /**
   * Écrit les expirations dues (FIFO, 12 mois après le gain). Idempotent :
   * clé `expire:<lot>:<séquence>` unique, une expiration n'est jamais écrite deux fois.
   */
  async runExpirations(
    now = new Date(),
  ): Promise<{ users: number; entries: number; points: number }> {
    const users = await this.prisma.ledgerEntry.findMany({
      where: { expiresAt: { lte: now }, amount: { gt: 0 } },
      distinct: ['userId'],
      select: { userId: true },
    });
    let entries = 0;
    let points = 0;
    for (const { userId } of users) {
      const due = [...splitByClub(await this.entries(userId))].flatMap(([clubId, list]) =>
        computeExpirations(list, now).map((d) => ({ ...d, clubId })),
      );
      if (!due.length) continue;
      const res = await this.prisma.ledgerEntry.createMany({
        data: due.map((d) => ({
          userId,
          clubId: d.clubId,
          type: 'EXPIRE' as const,
          amount: -d.amount,
          sourceType: 'EXPIRATION' as const,
          sourceId: d.lotEntryId,
          idempotencyKey: `expire:${d.lotEntryId}:${d.sequence}`,
          earnedAt: now,
          availableAt: now,
        })),
        skipDuplicates: true,
      });
      entries += res.count;
      points += due.reduce((s, d) => s + d.amount, 0);
    }
    if (entries) this.logger.log(`Expiration : ${entries} écriture(s), ${points} points GPR`);
    return { users: users.length, entries, points };
  }
}
