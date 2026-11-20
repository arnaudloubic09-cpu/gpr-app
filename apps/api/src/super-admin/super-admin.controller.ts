import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import {
  superAdjustmentSchema,
  SuperAdjustmentInput,
  AdminUserInput,
  adminUserInputSchema,
  ClubInput,
  clubInputSchema,
  ConnectorInput,
  connectorInputSchema,
  RuleSetInput,
  ruleSetInputSchema,
} from '@gpr/core';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser, Roles } from '../auth/decorators';
import { periodDays } from '../club-admin/club-admin.controller';
import { PlayersService } from '../club-admin/players.service';
import { StatsService } from '../club-admin/stats.service';
import { AuditService } from '../common/audit/audit.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JobsService } from '../jobs/jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import { RulesService } from '../rules/rules.service';

const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

/** Espace super admin GPR : tout le groupement. */
@Controller('admin')
@Roles(Role.SUPER_ADMIN)
export class SuperAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly crypto: CryptoService,
    private readonly rules: RulesService,
    private readonly stats: StatsService,
    private readonly players: PlayersService,
    private readonly jobs: JobsService,
  ) {}

  private actor(u: AuthUser) {
    return { id: u.id, role: u.role };
  }

  // ── Statistiques ──
  @Get('stats')
  globalStats(@Query('period') period?: string) {
    return this.stats.global(periodDays(period));
  }

  // ── Clubs & connecteurs ──
  @Get('clubs')
  async clubs() {
    const clubs = await this.prisma.club.findMany({
      orderBy: { name: 'asc' },
      include: {
        connector: true,
        _count: { select: { admins: true } },
        syncRuns: { orderBy: { startedAt: 'desc' }, take: 10, select: { status: true } },
      },
    });
    return clubs.map(({ connector, syncRuns, _count, ...c }) => {
      const finished = syncRuns.filter((r) => r.status !== 'RUNNING');
      const firstOk = finished.findIndex((r) => r.status === 'SUCCESS');
      return {
        ...c,
        adminsCount: _count.admins,
        connector: connector && {
          provider: connector.provider,
          externalClubId: connector.externalClubId,
          syncIntervalMinutes: connector.syncIntervalMinutes,
          hasCredentials: !!connector.credentialsEncrypted, // jamais les identifiants eux-mêmes
          lastSyncAt: connector.lastSyncAt,
          lastSyncStatus: connector.lastSyncStatus,
          lastSyncError: connector.lastSyncError,
          failureAlertSentAt: connector.failureAlertSentAt,
        },
        consecutiveFailures: firstOk === -1 ? finished.length : firstOk,
      };
    });
  }

  @Post('clubs')
  async createClub(
    @Body(new ZodValidationPipe(clubInputSchema)) body: ClubInput,
    @CurrentUser() user: AuthUser,
  ) {
    let slug = slugify(body.name);
    if (await this.prisma.club.findUnique({ where: { slug } }))
      slug = `${slug}-${Date.now().toString(36)}`;
    const club = await this.prisma.club.create({ data: { ...body, slug } });
    await this.audit.log({
      actor: this.actor(user),
      action: 'club.create',
      entityType: 'Club',
      entityId: club.id,
      clubId: club.id,
      after: body,
    });
    return club;
  }

  @Patch('clubs/:clubId')
  async updateClub(
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @Body(new ZodValidationPipe(clubInputSchema)) body: ClubInput,
    @CurrentUser() user: AuthUser,
  ) {
    const before = await this.prisma.club.findUnique({
      where: { id: clubId },
      include: { connector: true },
    });
    if (!before) throw new NotFoundException('Club introuvable');
    const club = await this.prisma.club.update({ where: { id: clubId }, data: body });
    if (before.connector) {
      if (club.isActive) await this.jobs.scheduleClub(clubId, before.connector.syncIntervalMinutes);
      else await this.jobs.unscheduleClub(clubId);
    }
    const { connector: _c, ...beforeClub } = before;
    await this.audit.log({
      actor: this.actor(user),
      action: 'club.update',
      entityType: 'Club',
      entityId: clubId,
      clubId,
      before: beforeClub,
      after: body,
    });
    return club;
  }

  @Put('clubs/:clubId/connector')
  async upsertConnector(
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @Body(new ZodValidationPipe(connectorInputSchema)) body: ConnectorInput,
    @CurrentUser() user: AuthUser,
  ) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club) throw new NotFoundException('Club introuvable');
    const { credentials, ...rest } = body;
    const data = {
      ...rest,
      ...(credentials ? { credentialsEncrypted: this.crypto.encryptJson(credentials) } : {}),
    };
    const saved = await this.prisma.clubConnectorConfig.upsert({
      where: { clubId },
      create: { clubId, ...data },
      update: data,
    });
    if (club.isActive) await this.jobs.scheduleClub(clubId, saved.syncIntervalMinutes);
    await this.audit.log({
      actor: this.actor(user),
      action: 'club.connector.update',
      entityType: 'ClubConnectorConfig',
      entityId: saved.id,
      clubId,
      // Les identifiants ne sont jamais écrits dans le journal.
      after: { ...rest, credentialsChanged: !!credentials },
    });
    return {
      provider: saved.provider,
      externalClubId: saved.externalClubId,
      syncIntervalMinutes: saved.syncIntervalMinutes,
      hasCredentials: !!saved.credentialsEncrypted,
    };
  }

  // ── Règles GPR ──
  @Get('rules')
  async getRules() {
    return { active: await this.rules.getActive(), history: await this.rules.history() };
  }

  @Post('rules')
  createRules(
    @Body(new ZodValidationPipe(ruleSetInputSchema)) body: RuleSetInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.rules.createVersion(body, user);
  }

  // ── Journal d'audit ──
  @Get('audit')
  async auditLog(
    @Query('clubId', new ParseUUIDPipe({ optional: true })) clubId?: string,
    @Query('entityType') entityType?: string,
    @Query('cursor', new ParseUUIDPipe({ optional: true })) cursor?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
  ) {
    const take = Math.min(Math.max(limit, 1), 200);
    const where: Prisma.AuditLogWhereInput = {
      ...(clubId ? { clubId } : {}),
      ...(entityType ? { entityType } : {}),
    };
    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, take);
    const actorIds = [...new Set(page.map((r) => r.actorId).filter(Boolean))] as string[];
    const actors = await this.prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    return {
      items: page.map((r) => ({ ...r, actor: actors.find((a) => a.id === r.actorId) ?? null })),
      nextCursor: rows.length > take ? page[page.length - 1].id : null,
    };
  }

  // ── Comptes admin ──
  @Get('users')
  adminUsers() {
    return this.prisma.user.findMany({
      where: { role: { in: [Role.CLUB_ADMIN, Role.SUPER_ADMIN] } },
      orderBy: [{ role: 'desc' }, { lastName: 'asc' }],
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        disabledAt: true,
        lastLoginAt: true,
        club: { select: { id: true, name: true } },
      },
    });
  }

  @Post('users')
  async createAdmin(
    @Body(new ZodValidationPipe(adminUserInputSchema)) body: AdminUserInput,
    @CurrentUser() user: AuthUser,
  ) {
    if (await this.prisma.user.findUnique({ where: { email: body.email } })) {
      throw new ConflictException(
        'Un compte existe déjà avec cet email (les comptes joueur et admin sont séparés).',
      );
    }
    if (body.clubId && !(await this.prisma.club.findUnique({ where: { id: body.clubId } }))) {
      throw new BadRequestException('Club inconnu');
    }
    const created = await this.prisma.user.create({ data: body });
    await this.audit.log({
      actor: this.actor(user),
      action: 'admin.create',
      entityType: 'User',
      entityId: created.id,
      clubId: body.clubId,
      after: body,
    });
    return created;
  }

  @Post('users/:userId/disable')
  @HttpCode(HttpStatus.OK)
  disable(@Param('userId', ParseUUIDPipe) userId: string, @CurrentUser() user: AuthUser) {
    return this.setDisabled(userId, 'disable', user);
  }

  @Post('users/:userId/enable')
  @HttpCode(HttpStatus.OK)
  enable(@Param('userId', ParseUUIDPipe) userId: string, @CurrentUser() user: AuthUser) {
    return this.setDisabled(userId, 'enable', user);
  }

  private async setDisabled(userId: string, action: 'disable' | 'enable', user: AuthUser) {
    if (userId === user.id)
      throw new BadRequestException('Vous ne pouvez pas désactiver votre propre compte.');
    const target = await this.prisma.user.findFirst({
      where: { id: userId, role: { in: [Role.CLUB_ADMIN, Role.SUPER_ADMIN] } },
    });
    if (!target) throw new NotFoundException('Compte admin introuvable');
    const disabledAt = action === 'disable' ? new Date() : null;
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { disabledAt } }),
      // Désactivation : toutes les sessions ouvertes sont révoquées immédiatement.
      ...(disabledAt
        ? [
            this.prisma.refreshToken.updateMany({
              where: { userId, revokedAt: null },
              data: { revokedAt: disabledAt },
            }),
          ]
        : []),
    ]);
    await this.audit.log({
      actor: this.actor(user),
      action: `admin.${action}`,
      entityType: 'User',
      entityId: userId,
      clubId: target.clubId,
    });
    return { id: userId, disabledAt };
  }

  // ── Joueurs (tout le groupement) ──
  @Get('players')
  allPlayers(@Query('search') search?: string) {
    return this.players.list(null, search);
  }

  @Get('players/:userId')
  playerDetail(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.players.detail(userId, null);
  }

  @Post('players/:userId/adjustments')
  adjustPlayer(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(superAdjustmentSchema)) body: SuperAdjustmentInput,
    @CurrentUser() user: AuthUser,
  ) {
    const { clubId, ...input } = body;
    return this.players.adjust(userId, null, clubId, input, user);
  }
}
