import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  AdjustmentInput,
  adjustmentSchema,
  RewardInput,
  rewardInputSchema,
  STANDARD_CATALOG,
  STATS_PERIODS,
  StatsPeriod,
} from '@gpr/core';
import type { AuthUser } from '../auth/auth.types';
import { ClubScoped, CurrentUser, Roles } from '../auth/decorators';
import { AuditService } from '../common/audit/audit.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { GamificationService } from '../gamification/gamification.service';
import { PrismaService } from '../prisma/prisma.service';
import { ClubCouponsService } from './club-coupons.service';
import { PlayersService } from './players.service';
import { StatsService } from './stats.service';

export const periodDays = (p?: string) =>
  STATS_PERIODS[(p as StatsPeriod) in STATS_PERIODS ? (p as StatsPeriod) : '30d'];

/** Espace admin club (le super admin y accède pour n'importe quel club). */
@Controller('clubs/:clubId')
@Roles(Role.CLUB_ADMIN, Role.SUPER_ADMIN)
@ClubScoped()
export class ClubAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coupons: ClubCouponsService,
    private readonly players: PlayersService,
    private readonly stats: StatsService,
    private readonly audit: AuditService,
    private readonly gamification: GamificationService,
  ) {}

  @Get('stats')
  clubStats(@Param('clubId', ParseUUIDPipe) clubId: string, @Query('period') period?: string) {
    return this.stats.club(clubId, periodDays(period));
  }

  // ── Coupons (accueil / comptoir) ──
  @Get('coupons/:code')
  lookupCoupon(@Param('clubId', ParseUUIDPipe) clubId: string, @Param('code') code: string) {
    return this.coupons.lookup(clubId, code);
  }

  @Post('coupons/:code/validate')
  @HttpCode(HttpStatus.OK)
  validateCoupon(
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @Param('code') code: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.coupons.validate(clubId, code, user);
  }

  // ── Catalogue ──
  @Get('admin/rewards')
  async rewards(@Param('clubId', ParseUUIDPipe) clubId: string) {
    const rewards = await this.prisma.reward.findMany({
      where: { clubId },
      orderBy: [{ isActive: 'desc' }, { costGpr: 'asc' }],
      include: {
        _count: { select: { coupons: { where: { status: { in: ['ACTIVE', 'USED'] } } } } },
      },
    });
    return rewards.map(({ _count, ...r }) => ({ ...r, couponsCount: _count.coupons }));
  }

  @Post('admin/rewards')
  async createReward(
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @Body(new ZodValidationPipe(rewardInputSchema)) body: RewardInput,
    @CurrentUser() user: AuthUser,
  ) {
    const reward = await this.prisma.reward.create({ data: { ...body, clubId } });
    await this.audit.log({
      actor: { id: user.id, role: user.role },
      action: 'reward.create',
      entityType: 'Reward',
      entityId: reward.id,
      clubId,
      after: body,
    });
    await this.gamification.onRewardCreated(reward);
    return reward;
  }

  /** Importe le catalogue type GPR (seulement les récompenses absentes, par intitulé). */
  @Post('admin/rewards/standard')
  async importStandard(
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const existing = await this.prisma.reward.findMany({
      where: { clubId },
      select: { title: true },
    });
    const missing = STANDARD_CATALOG.filter((r) => !existing.some((e) => e.title === r.title));
    if (missing.length)
      await this.prisma.reward.createMany({ data: missing.map((r) => ({ ...r, clubId })) });
    await this.audit.log({
      actor: { id: user.id, role: user.role },
      action: 'reward.standard.import',
      entityType: 'Club',
      entityId: clubId,
      clubId,
      after: { added: missing.map((r) => r.title) },
    });
    return { added: missing.length };
  }

  @Patch('admin/rewards/:rewardId')
  async updateReward(
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @Param('rewardId', ParseUUIDPipe) rewardId: string,
    @Body(new ZodValidationPipe(rewardInputSchema)) body: RewardInput,
    @CurrentUser() user: AuthUser,
  ) {
    const before = await this.prisma.reward.findFirst({ where: { id: rewardId, clubId } });
    if (!before) throw new NotFoundException('Récompense introuvable');
    const reward = await this.prisma.reward.update({
      where: { id: rewardId },
      data: {
        description: null,
        discountValue: null,
        stock: null,
        startsAt: null,
        endsAt: null,
        ...body,
      },
    });
    await this.audit.log({
      actor: { id: user.id, role: user.role },
      action: 'reward.update',
      entityType: 'Reward',
      entityId: rewardId,
      clubId,
      before,
      after: body,
    });
    return reward;
  }

  // ── Joueurs ──
  @Get('players')
  listPlayers(@Param('clubId', ParseUUIDPipe) clubId: string, @Query('search') search?: string) {
    return this.players.list(clubId, search);
  }

  @Get('players/:userId')
  player(
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.players.detail(userId, clubId);
  }

  @Post('players/:userId/adjustments')
  adjust(
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(adjustmentSchema)) body: AdjustmentInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.players.adjust(userId, clubId, clubId, body, user);
  }
}
