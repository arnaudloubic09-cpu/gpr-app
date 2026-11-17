import { Injectable, Logger } from '@nestjs/common';
import { Challenge, Prisma } from '@prisma/client';
import { addMonths, ChallengeDef, evaluateChallenge, periodKeyFor, PlayedGame } from '@gpr/core';
import { PrismaService } from '../prisma/prisma.service';
import { ActiveRules, RulesService } from '../rules/rules.service';
import { LevelService } from './level.service';
import { NotifyInput, NotificationsService } from './notifications.service';

const WATERMARK = 'gamification.watermark';
const OVERLAP_MS = 60 * 60_000;

const shortDate = (d: Date) =>
  d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });

/**
 * Tâche de gamification (toutes les 15 min). Pour chaque partie dont les points viennent
 * d'être VALIDÉS (H+2) : notification, évaluation des défis, badges, niveau.
 * Entièrement idempotente : recalcul à partir des données, récompenses à clé unique.
 */
@Injectable()
export class GamificationService {
  private readonly logger = new Logger(GamificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: RulesService,
    private readonly notifications: NotificationsService,
    private readonly levels: LevelService,
  ) {}

  async run(now = new Date()) {
    const state = await this.prisma.jobState.findUnique({ where: { key: WATERMARK } });
    const from = new Date(
      (state ? new Date(state.value).getTime() : now.getTime() - 2 * 86_400_000) - OVERLAP_MS,
    );

    const validated = await this.prisma.ledgerEntry.findMany({
      where: { type: 'EARN', sourceType: 'BOOKING', availableAt: { gt: from, lte: now } },
    });
    const users = [...new Set(validated.map((e) => e.userId))];
    const rules = await this.rules.getActive();
    const challenges = await this.prisma.challenge.findMany({
      where: { isActive: true, startsAt: { lte: now } },
      include: { rewardBadge: true, club: { select: { name: true } } },
    });

    let completed = 0;
    for (const userId of users) {
      const games = await this.playedGames(userId, now);
      const newGames = games.filter((g) =>
        validated.some((v) => v.userId === userId && v.sourceId === g.bookingId),
      );
      await this.notifyValidatedPoints(userId, newGames, now);
      for (const c of challenges)
        completed += await this.evaluate(c, userId, games, newGames, rules, now);
      await this.notifyLevel(userId, now);
    }

    await this.prisma.jobState.upsert({
      where: { key: WATERMARK },
      create: { key: WATERMARK, value: now.toISOString() },
      update: { value: now.toISOString() },
    });
    if (users.length)
      this.logger.log(`Gamification : ${users.length} joueur(s), ${completed} défi(s) réussi(s)`);
    return { users: users.length, completed };
  }

  /** Parties validées et non annulées du joueur. */
  async playedGames(
    userId: string,
    now: Date,
  ): Promise<(PlayedGame & { clubName: string; points: number })[]> {
    const earns = await this.prisma.ledgerEntry.findMany({
      where: {
        userId,
        type: { in: ['EARN', 'BONUS'] },
        sourceType: 'BOOKING',
        availableAt: { lte: now },
      },
    });
    const reversed = new Set(
      (
        await this.prisma.ledgerEntry.findMany({
          where: { userId, type: 'REVERSAL', reversesEntryId: { in: earns.map((e) => e.id) } },
          select: { reversesEntryId: true },
        })
      ).map((r) => r.reversesEntryId),
    );
    const points = new Map<string, number>();
    for (const e of earns)
      if (!reversed.has(e.id) && e.sourceId)
        points.set(e.sourceId, (points.get(e.sourceId) ?? 0) + e.amount);
    const validIds = earns
      .filter((e) => e.type === 'EARN' && !reversed.has(e.id))
      .map((e) => e.sourceId!);
    const bookings = await this.prisma.booking.findMany({
      where: { id: { in: validIds } },
      include: { club: { select: { name: true } } },
    });
    return bookings.map((b) => ({
      bookingId: b.id,
      clubId: b.clubId,
      clubName: b.club.name,
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      points: points.get(b.id) ?? 0,
    }));
  }

  private async notifyValidatedPoints(
    userId: string,
    games: { bookingId: string; clubName: string; startsAt: Date; points: number }[],
    now: Date,
  ) {
    await this.notifications.notifyMany(
      games
        .filter((g) => g.points > 0)
        .map<NotifyInput>((g) => ({
          userId,
          type: 'POINTS_VALIDATED',
          title: `+${g.points} points GPR`,
          body: `Vos points pour la partie du ${shortDate(g.startsAt)} à ${g.clubName} sont validés.`,
          data: { screen: 'home' },
          dedupeKey: `points:${g.bookingId}:${userId}`,
        })),
    );
    void now;
  }

  private async evaluate(
    c: Challenge & {
      rewardBadge: { id: string; name: string } | null;
      club: { name: string } | null;
    },
    userId: string,
    games: PlayedGame[],
    newGames: PlayedGame[],
    rules: ActiveRules,
    now: Date,
  ): Promise<number> {
    const def: ChallengeDef = {
      id: c.id,
      clubId: c.clubId,
      condition: c.condition,
      period: c.period,
      startsAt: c.startsAt,
      endsAt: c.endsAt,
    };
    const keys = [...new Set(newGames.map((g) => periodKeyFor(c.period, g.startsAt)))];
    let completed = 0;
    for (const periodKey of keys) {
      let result;
      try {
        result = evaluateChallenge(def, games, periodKey, { offPeakWindows: rules.offPeakWindows });
      } catch (e) {
        this.logger.warn(
          `Défi « ${c.name} » ignoré (condition invalide) : ${(e as Error).message}`,
        );
        return 0;
      }
      if (result.value === 0) continue;
      const progress = { value: result.value, target: result.target } as Prisma.InputJsonValue;
      const existing = await this.prisma.challengeProgress.findUnique({
        where: { challengeId_userId_periodKey: { challengeId: c.id, userId, periodKey } },
      });
      await this.prisma.challengeProgress.upsert({
        where: { challengeId_userId_periodKey: { challengeId: c.id, userId, periodKey } },
        create: {
          challengeId: c.id,
          userId,
          periodKey,
          progress,
          completedAt: result.completed ? now : null,
        },
        // Un défi réussi le reste (pas de retrait de récompense, choix validé).
        update: {
          progress,
          ...(result.completed && !existing?.completedAt ? { completedAt: now } : {}),
        },
      });
      if (result.completed) {
        completed++;
        await this.reward(c, userId, periodKey, rules, now);
      }
    }
    return completed;
  }

  private async reward(
    c: Challenge & { rewardBadge: { id: string; name: string } | null },
    userId: string,
    periodKey: string,
    rules: ActiveRules,
    now: Date,
  ) {
    const parts: string[] = [];
    if (c.rewardGpr) {
      await this.prisma.ledgerEntry.createMany({
        data: [
          {
            userId,
            type: 'CHALLENGE',
            amount: c.rewardGpr,
            sourceType: 'CHALLENGE',
            sourceId: c.id,
            idempotencyKey: `challenge:${c.id}:${userId}:${periodKey}`,
            clubId: c.clubId,
            reason: c.name,
            ruleSetVersion: rules.version,
            earnedAt: now,
            availableAt: now,
            expiresAt: addMonths(now, rules.expirationMonths),
          },
        ],
        skipDuplicates: true,
      });
      parts.push(`+${c.rewardGpr} points GPR`);
    }
    if (c.rewardBadge) {
      const res = await this.prisma.playerBadge.createMany({
        data: [{ userId, badgeId: c.rewardBadge.id, challengeId: c.id }],
        skipDuplicates: true,
      });
      if (res.count) {
        await this.notifications.notify({
          userId,
          type: 'BADGE_EARNED',
          title: `Nouveau badge : ${c.rewardBadge.name}`,
          body: 'Retrouvez-le dans l’onglet Défis.',
          data: { screen: 'challenges' },
          dedupeKey: `badge:${userId}:${c.rewardBadge.id}`,
        });
      }
      parts.push(`badge ${c.rewardBadge.name}`);
    }
    await this.notifications.notify({
      userId,
      type: 'CHALLENGE_COMPLETED',
      title: `Défi réussi : ${c.name}`,
      body: parts.length ? `Bravo ! Vous gagnez ${parts.join(' et le ')}.` : 'Bravo !',
      data: { screen: 'challenges', challengeId: c.id },
      dedupeKey: `challenge:${c.id}:${userId}:${periodKey}`,
    });
  }

  private async notifyLevel(userId: string, now: Date) {
    const status = await this.levels.status(userId, now);
    if (status.current.minGpr === 0) return; // Bronze : niveau de départ
    await this.notifications.notify({
      userId,
      type: 'LEVEL_UP',
      title: `Vous passez au niveau ${status.current.label} !`,
      body: 'De nouvelles récompenses peuvent vous être réservées dans les clubs.',
      data: { screen: 'home' },
      dedupeKey: `level:${userId}:${status.current.code}`,
    });
  }

  /** Coupons qui expirent dans les 24 h (rappel unique). */
  async couponReminders(now = new Date()) {
    const soon = await this.prisma.coupon.findMany({
      where: {
        status: 'ACTIVE',
        expiresAt: { gt: now, lte: new Date(now.getTime() + 24 * 3600_000) },
      },
      include: { reward: { select: { title: true } }, club: { select: { name: true } } },
    });
    return this.notifications.notifyMany(
      soon.map((c) => ({
        userId: c.userId,
        type: 'COUPON_EXPIRING' as const,
        title: 'Votre coupon expire demain',
        body: `« ${c.reward.title} » à ${c.club.name}. Sans utilisation, vos points vous seront rendus.`,
        data: { screen: 'coupon', couponId: c.id },
        dedupeKey: `coupon-expiring:${c.id}`,
      })),
    );
  }

  /** Nouvelle récompense : prévient les joueurs dont c'est le club principal. */
  async onRewardCreated(reward: {
    id: string;
    clubId: string;
    title: string;
    costGpr: number;
    isActive: boolean;
    startsAt: Date | null;
  }) {
    if (!reward.isActive || (reward.startsAt && reward.startsAt > new Date())) return 0;
    const [club, players] = await Promise.all([
      this.prisma.club.findUnique({ where: { id: reward.clubId }, select: { name: true } }),
      this.prisma.user.findMany({
        where: { favoriteClubId: reward.clubId, role: 'PLAYER', anonymizedAt: null },
        select: { id: true },
      }),
    ]);
    return this.notifications.notifyMany(
      players.map((p) => ({
        userId: p.id,
        type: 'NEW_REWARD' as const,
        title: `Nouveau à ${club?.name ?? 'votre club'}`,
        body: `${reward.title} : ${reward.costGpr} points GPR.`,
        data: { screen: 'rewards', clubId: reward.clubId, rewardId: reward.id },
        dedupeKey: `new-reward:${reward.id}:${p.id}`,
      })),
    );
  }
}
