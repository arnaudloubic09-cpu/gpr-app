import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomInt } from 'node:crypto';
import { applicablePerks, LevelPerkInput, parseCounterCode } from '@gpr/core';
import type { AuthUser } from '../auth/auth.types';
import { AnalyticsService } from '../common/analytics/analytics.service';
import { AuditService } from '../common/audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RulesService } from '../rules/rules.service';
import { LevelService } from './level.service';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const block = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

/** Avantages de niveau des clubs et carte de membre présentée au comptoir. */
@Injectable()
export class PerksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: RulesService,
    private readonly levels: LevelService,
    private readonly audit: AuditService,
    private readonly analytics: AnalyticsService,
  ) {}

  // ── Administration (club) ──
  list(clubId: string) {
    return this.prisma.levelPerk.findMany({
      where: { clubId },
      orderBy: [{ isActive: 'desc' }, { levelCode: 'asc' }, { category: 'asc' }],
    });
  }

  private async checkLevel(code: string) {
    const { levels } = await this.rules.getActive();
    if (!levels.some((l) => l.code === code)) throw new BadRequestException('Niveau inconnu');
  }

  async create(clubId: string, input: LevelPerkInput, actor: AuthUser) {
    await this.checkLevel(input.levelCode);
    const perk = await this.prisma.levelPerk.create({ data: { ...input, clubId } });
    await this.audit.log({
      actor: { id: actor.id, role: actor.role },
      action: 'perk.create',
      entityType: 'LevelPerk',
      entityId: perk.id,
      clubId,
      after: input,
    });
    return perk;
  }

  async update(clubId: string, id: string, input: LevelPerkInput, actor: AuthUser) {
    const before = await this.prisma.levelPerk.findFirst({ where: { id, clubId } });
    if (!before) throw new NotFoundException('Avantage introuvable');
    await this.checkLevel(input.levelCode);
    const perk = await this.prisma.levelPerk.update({ where: { id }, data: input });
    await this.audit.log({
      actor: { id: actor.id, role: actor.role },
      action: 'perk.update',
      entityType: 'LevelPerk',
      entityId: id,
      clubId,
      before,
      after: input,
    });
    return perk;
  }

  // ── Joueur ──
  private async ensureMemberCode(userId: string): Promise<string> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { memberCode: true },
    });
    if (user.memberCode) return user.memberCode;
    for (let i = 0; i < 5; i++) {
      try {
        const code = `GPRM-${block()}-${block()}`;
        await this.prisma.user.updateMany({
          where: { id: userId, memberCode: null },
          data: { memberCode: code },
        });
        return (
          await this.prisma.user.findUniqueOrThrow({
            where: { id: userId },
            select: { memberCode: true },
          })
        ).memberCode!;
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      }
    }
    throw new Error('Impossible de générer un code de carte');
  }

  /** Carte de membre : code, niveau et avantages dans chaque club (club principal en premier). */
  async memberCard(userId: string) {
    const [memberCode, level, rules, user, clubs] = await Promise.all([
      this.ensureMemberCode(userId),
      this.levels.status(userId),
      this.rules.getActive(),
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { firstName: true, lastName: true, favoriteClubId: true },
      }),
      this.prisma.club.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, levelPerks: { where: { isActive: true } } },
      }),
    ]);
    const nextLevel = level.next;
    return {
      memberCode,
      firstName: user.firstName,
      lastName: user.lastName,
      level,
      clubs: clubs
        .map((c) => ({
          club: { id: c.id, name: c.name },
          perks: applicablePerks(c.levelPerks, level.current.code, rules.levels).map(
            ({ id, label, category, discountPercent }) => ({
              id,
              label,
              category,
              discountPercent,
            }),
          ),
          // Ce que le niveau suivant débloquerait dans ce club (motivation)
          nextLevelPerks: nextLevel
            ? applicablePerks(c.levelPerks, nextLevel.code, rules.levels)
                .filter(
                  (p) =>
                    !applicablePerks(c.levelPerks, level.current.code, rules.levels).some(
                      (m) => m.id === p.id,
                    ),
                )
                .map(({ id, label }) => ({ id, label }))
            : [],
        }))
        .sort(
          (a, b) =>
            Number(b.club.id === user.favoriteClubId) - Number(a.club.id === user.favoriteClubId),
        ),
    };
  }

  // ── Comptoir ──
  async check(clubId: string, raw: string, actor: AuthUser) {
    const parsed = parseCounterCode(raw);
    if (parsed?.kind !== 'member')
      throw new NotFoundException({ code: 'UNKNOWN', message: 'Carte de membre inconnue.' });
    const user = await this.prisma.user.findFirst({
      where: { memberCode: parsed.code, role: 'PLAYER', anonymizedAt: null },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!user)
      throw new NotFoundException({ code: 'UNKNOWN', message: 'Carte de membre inconnue.' });
    const [level, rules, perks] = await Promise.all([
      this.levels.status(user.id),
      this.rules.getActive(),
      this.prisma.levelPerk.findMany({ where: { clubId, isActive: true } }),
    ]);
    await this.analytics.track('member.checked', {
      userId: user.id,
      clubId,
      payload: { level: level.current.code, by: actor.id },
    });
    return {
      player: { firstName: user.firstName, lastInitial: user.lastName?.charAt(0) ?? null },
      level: { code: level.current.code, label: level.current.label },
      perks: applicablePerks(perks, level.current.code, rules.levels).map(
        ({ id, label, category, discountPercent }) => ({ id, label, category, discountPercent }),
      ),
    };
  }
}
