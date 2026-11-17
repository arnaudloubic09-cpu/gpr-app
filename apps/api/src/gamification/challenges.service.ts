import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import {
  BadgeInput,
  ChallengeInput,
  describeCondition,
  evaluateChallenge,
  periodKeyFor,
} from '@gpr/core';
import type { AuthUser } from '../auth/auth.types';
import { AuditService } from '../common/audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RulesService } from '../rules/rules.service';
import { GamificationService } from './gamification.service';

@Injectable()
export class ChallengesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: RulesService,
    private readonly audit: AuditService,
    private readonly gamification: GamificationService,
  ) {}

  // ── Vue joueur ──

  /** Défis en cours (progression calculée en direct à partir des parties validées) et historique. */
  async forPlayer(userId: string, now = new Date()) {
    const [challenges, games, rules, done] = await Promise.all([
      this.prisma.challenge
        .findMany({
          where: {
            isActive: true,
            startsAt: { lte: now },
            OR: [{ endsAt: null }, { endsAt: { gt: now } }],
            club: { is: null },
          },
          include: { rewardBadge: { select: { id: true, name: true, icon: true } } },
        })
        .then(async (network) => [
          ...network.map((c) => ({ ...c, club: null as { id: string; name: string } | null })),
          ...(await this.prisma.challenge.findMany({
            where: {
              isActive: true,
              startsAt: { lte: now },
              OR: [{ endsAt: null }, { endsAt: { gt: now } }],
              club: { isActive: true },
            },
            include: {
              rewardBadge: { select: { id: true, name: true, icon: true } },
              club: { select: { id: true, name: true } },
            },
          })),
        ]),
      this.gamification.playedGames(userId, now),
      this.rules.getActive(),
      this.prisma.challengeProgress.findMany({
        where: { userId, completedAt: { not: null } },
        orderBy: { completedAt: 'desc' },
        take: 30,
        include: {
          challenge: { select: { name: true, rewardGpr: true, club: { select: { name: true } } } },
        },
      }),
    ]);

    const active = challenges.flatMap((c) => {
      const periodKey = periodKeyFor(c.period, now);
      try {
        const r = evaluateChallenge(
          {
            id: c.id,
            clubId: c.clubId,
            condition: c.condition,
            period: c.period,
            startsAt: c.startsAt,
            endsAt: c.endsAt,
          },
          games,
          periodKey,
          { offPeakWindows: rules.offPeakWindows },
        );
        return [
          {
            id: c.id,
            name: c.name,
            description: c.description,
            objective: describeCondition(c.condition),
            period: c.period,
            endsAt: c.endsAt,
            club: c.club,
            rewardGpr: c.rewardGpr,
            rewardBadge: c.rewardBadge,
            progress: { value: r.value, target: r.target },
            completed: r.completed,
          },
        ];
      } catch {
        return [];
      }
    });

    return {
      active: active.sort(
        (a, b) =>
          Number(a.completed) - Number(b.completed) ||
          b.progress.value / b.progress.target - a.progress.value / a.progress.target,
      ),
      completed: done.map((p) => ({
        challengeId: p.challengeId,
        name: p.challenge.name,
        club: p.challenge.club?.name ?? null,
        rewardGpr: p.challenge.rewardGpr,
        periodKey: p.periodKey,
        completedAt: p.completedAt,
      })),
    };
  }

  async badgesForPlayer(userId: string) {
    const [badges, mine] = await Promise.all([
      this.prisma.badge.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.playerBadge.findMany({ where: { userId } }),
    ]);
    return badges.map((b) => ({
      ...b,
      earnedAt: mine.find((m) => m.badgeId === b.id)?.awardedAt ?? null,
    }));
  }

  // ── Administration ──

  async list(clubId: string | null) {
    const rows = await this.prisma.challenge.findMany({
      where: { clubId },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
      include: { rewardBadge: { select: { id: true, name: true } } },
    });
    const stats = await this.prisma.challengeProgress.groupBy({
      by: ['challengeId'],
      where: { challengeId: { in: rows.map((r) => r.id) } },
      _count: { _all: true, completedAt: true },
    });
    return rows.map((r) => {
      const s = stats.find((x) => x.challengeId === r.id);
      return {
        ...r,
        objective: (() => {
          try {
            return describeCondition(r.condition);
          } catch {
            return '—';
          }
        })(),
        participants: s?._count._all ?? 0,
        completions: s?._count.completedAt ?? 0,
      };
    });
  }

  private async check(input: ChallengeInput, clubId: string | null, actor: AuthUser) {
    if (
      input.rewardBadgeId &&
      !(await this.prisma.badge.findUnique({ where: { id: input.rewardBadgeId } }))
    ) {
      throw new BadRequestException('Badge inconnu');
    }
    if (clubId && input.condition.type === 'DISTINCT_CLUBS') {
      throw new BadRequestException(
        '« Clubs différents » n’a de sens que pour un défi du groupement.',
      );
    }
    if (actor.role === Role.CLUB_ADMIN && input.rewardGpr) {
      const { clubAdjustmentMax } = await this.rules.getActive();
      if (input.rewardGpr > clubAdjustmentMax) {
        throw new ForbiddenException(
          `Un défi de club peut rapporter au maximum ${clubAdjustmentMax} points GPR.`,
        );
      }
    }
  }

  async create(input: ChallengeInput, clubId: string | null, actor: AuthUser) {
    await this.check(input, clubId, actor);
    const created = await this.prisma.challenge.create({
      data: {
        ...input,
        condition: input.condition as Prisma.InputJsonValue,
        trigger: 'BOOKING_VALIDATED',
        clubId,
        createdById: actor.id,
      },
    });
    await this.audit.log({
      actor: { id: actor.id, role: actor.role },
      action: 'challenge.create',
      entityType: 'Challenge',
      entityId: created.id,
      clubId,
      after: input,
    });
    return created;
  }

  async update(id: string, input: ChallengeInput, clubId: string | null, actor: AuthUser) {
    const before = await this.prisma.challenge.findFirst({ where: { id, clubId } });
    if (!before) throw new NotFoundException('Défi introuvable');
    await this.check(input, clubId, actor);
    const updated = await this.prisma.challenge.update({
      where: { id },
      data: {
        endsAt: null,
        rewardGpr: null,
        rewardBadgeId: null,
        ...input,
        condition: input.condition as Prisma.InputJsonValue,
      },
    });
    await this.audit.log({
      actor: { id: actor.id, role: actor.role },
      action: 'challenge.update',
      entityType: 'Challenge',
      entityId: id,
      clubId,
      before,
      after: input,
    });
    return updated;
  }

  async createBadge(input: BadgeInput, actor: AuthUser) {
    if (await this.prisma.badge.findUnique({ where: { code: input.code } }))
      throw new BadRequestException('Ce code de badge existe déjà');
    const b = await this.prisma.badge.create({ data: input });
    await this.audit.log({
      actor: { id: actor.id, role: actor.role },
      action: 'badge.create',
      entityType: 'Badge',
      entityId: b.id,
      after: input,
    });
    return b;
  }

  async updateBadge(id: string, input: BadgeInput, actor: AuthUser) {
    const before = await this.prisma.badge.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Badge introuvable');
    const b = await this.prisma.badge.update({ where: { id }, data: input });
    await this.audit.log({
      actor: { id: actor.id, role: actor.role },
      action: 'badge.update',
      entityType: 'Badge',
      entityId: id,
      before,
      after: input,
    });
    return b;
  }

  async badgesWithStats() {
    const [badges, counts] = await Promise.all([
      this.prisma.badge.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.playerBadge.groupBy({ by: ['badgeId'], _count: true }),
    ]);
    return badges.map((b) => ({
      ...b,
      awarded: counts.find((c) => c.badgeId === b.id)?._count ?? 0,
    }));
  }
}
