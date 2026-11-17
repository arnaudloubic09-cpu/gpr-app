import { Injectable, Logger } from '@nestjs/common';
import { LedgerEntry, LedgerType, Prisma } from '@prisma/client';
import { Balance, computeBalance, computeExpirations } from '@gpr/core';
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

  async balance(userId: string, now = new Date()): Promise<Balance> {
    return computeBalance(await this.entries(userId), now);
  }

  async transactions(
    userId: string,
    limit = 50,
    cursor?: string,
    now = new Date(),
  ): Promise<{ items: TransactionView[]; nextCursor: string | null }> {
    const rows = await this.prisma.ledgerEntry.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { club: { select: { id: true, name: true } } },
    });
    const page = rows.slice(0, limit);
    return {
      items: page.map((e) => ({
        id: e.id,
        type: e.type,
        label: TYPE_LABELS[e.type],
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
      const due = computeExpirations(await this.entries(userId), now);
      if (!due.length) continue;
      const res = await this.prisma.ledgerEntry.createMany({
        data: due.map((d) => ({
          userId,
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
