import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  BadgeInput,
  badgeInputSchema,
  ChallengeInput,
  challengeInputSchema,
  LevelPerkInput,
  levelPerkInputSchema,
} from '@gpr/core';
import type { AuthUser } from '../auth/auth.types';
import { ClubScoped, CurrentUser, Roles } from '../auth/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { RulesService } from '../rules/rules.service';
import { ChallengesService } from './challenges.service';
import { PerksService } from './perks.service';

/** Défis d'un club (admin club, ou super admin pour n'importe quel club). */
@Controller('clubs/:clubId/admin/challenges')
@Roles(Role.CLUB_ADMIN, Role.SUPER_ADMIN)
@ClubScoped()
export class ClubChallengesController {
  constructor(private readonly challenges: ChallengesService) {}

  @Get()
  list(@Param('clubId', ParseUUIDPipe) clubId: string) {
    return this.challenges.list(clubId);
  }

  @Post()
  create(
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @Body(new ZodValidationPipe(challengeInputSchema)) body: ChallengeInput,
    @CurrentUser() u: AuthUser,
  ) {
    return this.challenges.create(body, clubId, u);
  }

  @Patch(':challengeId')
  update(
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @Param('challengeId', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(challengeInputSchema)) body: ChallengeInput,
    @CurrentUser() u: AuthUser,
  ) {
    return this.challenges.update(id, body, clubId, u);
  }
}

/** Défis du groupement et badges (super admin). */
@Controller('admin')
@Roles(Role.SUPER_ADMIN)
export class NetworkGamificationController {
  constructor(private readonly challenges: ChallengesService) {}

  @Get('challenges')
  list() {
    return this.challenges.list(null);
  }

  @Post('challenges')
  create(
    @Body(new ZodValidationPipe(challengeInputSchema)) body: ChallengeInput,
    @CurrentUser() u: AuthUser,
  ) {
    return this.challenges.create(body, null, u);
  }

  @Patch('challenges/:challengeId')
  update(
    @Param('challengeId', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(challengeInputSchema)) body: ChallengeInput,
    @CurrentUser() u: AuthUser,
  ) {
    return this.challenges.update(id, body, null, u);
  }

  @Get('badges')
  badges() {
    return this.challenges.badgesWithStats();
  }

  @Post('badges')
  createBadge(
    @Body(new ZodValidationPipe(badgeInputSchema)) body: BadgeInput,
    @CurrentUser() u: AuthUser,
  ) {
    return this.challenges.createBadge(body, u);
  }

  @Patch('badges/:badgeId')
  updateBadge(
    @Param('badgeId', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(badgeInputSchema)) body: BadgeInput,
    @CurrentUser() u: AuthUser,
  ) {
    return this.challenges.updateBadge(id, body, u);
  }
}

/** Liste des badges et des niveaux, pour les formulaires des admins club. */
@Controller()
@Roles(Role.CLUB_ADMIN, Role.SUPER_ADMIN)
export class GamificationReferenceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: RulesService,
  ) {}

  /** Niveaux en vigueur (pour les formulaires d'avantages). */
  @Get('levels')
  async levels() {
    return (await this.rules.getActive()).levels;
  }

  @Get('badges')
  badges() {
    return this.prisma.badge.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, icon: true },
    });
  }
}

/** Avantages de niveau du club + lecture de la carte de membre au comptoir. */
@Controller('clubs/:clubId')
@Roles(Role.CLUB_ADMIN, Role.SUPER_ADMIN)
@ClubScoped()
export class ClubPerksController {
  constructor(private readonly perks: PerksService) {}

  @Get('admin/perks')
  list(@Param('clubId', ParseUUIDPipe) clubId: string) {
    return this.perks.list(clubId);
  }

  @Post('admin/perks')
  create(
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @Body(new ZodValidationPipe(levelPerkInputSchema)) body: LevelPerkInput,
    @CurrentUser() u: AuthUser,
  ) {
    return this.perks.create(clubId, body, u);
  }

  @Patch('admin/perks/:perkId')
  update(
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @Param('perkId', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(levelPerkInputSchema)) body: LevelPerkInput,
    @CurrentUser() u: AuthUser,
  ) {
    return this.perks.update(clubId, id, body, u);
  }

  @Get('members/:code')
  member(
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @Param('code') code: string,
    @CurrentUser() u: AuthUser,
  ) {
    return this.perks.check(clubId, code, u);
  }
}
