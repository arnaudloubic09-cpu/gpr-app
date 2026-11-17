import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post, Put } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ConsentsUpdate, consentsUpdateSchema, PushTokenInput, pushTokenSchema } from '@gpr/core';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser, Roles } from '../auth/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { ChallengesService } from './challenges.service';
import { GdprService } from './gdpr.service';
import { LevelService } from './level.service';
import { NotificationsService } from './notifications.service';
import { PerksService } from './perks.service';

/** Espace joueur : niveau, défis, badges, notifications, RGPD. */
@Controller('me')
@Roles(Role.PLAYER)
export class MeGamificationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly levels: LevelService,
    private readonly challenges: ChallengesService,
    private readonly notifications: NotificationsService,
    private readonly gdpr: GdprService,
    private readonly perks: PerksService,
  ) {}

  /** Carte de membre : QR à présenter au comptoir, niveau et avantages par club. */
  @Get('member-card')
  memberCard(@CurrentUser() u: AuthUser) {
    return this.perks.memberCard(u.id);
  }

  @Get('level')
  level(@CurrentUser() u: AuthUser) {
    return this.levels.status(u.id);
  }

  @Get('challenges')
  myChallenges(@CurrentUser() u: AuthUser) {
    return this.challenges.forPlayer(u.id);
  }

  @Get('badges')
  myBadges(@CurrentUser() u: AuthUser) {
    return this.challenges.badgesForPlayer(u.id);
  }

  @Get('notifications')
  myNotifications(@CurrentUser() u: AuthUser) {
    return this.notifications.list(u.id);
  }

  @Post('notifications/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  readAll(@CurrentUser() u: AuthUser) {
    return this.notifications.markAllRead(u.id);
  }

  /** Enregistre l'appareil pour les notifications push (jeton Expo). */
  @Post('push-tokens')
  @HttpCode(HttpStatus.NO_CONTENT)
  async addPushToken(
    @CurrentUser() u: AuthUser,
    @Body(new ZodValidationPipe(pushTokenSchema)) body: PushTokenInput,
  ) {
    await this.prisma.pushToken.upsert({
      where: { token: body.token },
      create: { ...body, userId: u.id },
      update: { userId: u.id, platform: body.platform, lastSeenAt: new Date() },
    });
  }

  @Delete('push-tokens')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removePushToken(
    @CurrentUser() u: AuthUser,
    @Body(new ZodValidationPipe(pushTokenSchema.pick({ token: true }))) body: { token: string },
  ) {
    await this.prisma.pushToken.deleteMany({ where: { token: body.token, userId: u.id } });
  }

  // ── RGPD ──
  @Get('consents')
  consents(@CurrentUser() u: AuthUser) {
    return this.gdpr.consents(u.id);
  }

  @Put('consents')
  setConsents(
    @CurrentUser() u: AuthUser,
    @Body(new ZodValidationPipe(consentsUpdateSchema)) body: ConsentsUpdate,
  ) {
    return this.gdpr.setConsents(u.id, body);
  }

  @Get('export')
  exportData(@CurrentUser() u: AuthUser) {
    return this.gdpr.export(u.id);
  }

  /** Envoie l'export par email (plus pratique sur mobile). */
  @Post('export')
  @HttpCode(HttpStatus.ACCEPTED)
  async exportByEmail(@CurrentUser() u: AuthUser) {
    await this.gdpr.sendExportByEmail(u.id);
    return { message: 'Vos données vous ont été envoyées par email.' };
  }

  @Post('deletion')
  requestDeletion(@CurrentUser() u: AuthUser) {
    return this.gdpr.requestDeletion(u.id);
  }

  @Delete('deletion')
  @HttpCode(HttpStatus.NO_CONTENT)
  cancelDeletion(@CurrentUser() u: AuthUser) {
    return this.gdpr.cancelDeletion(u.id);
  }
}
