import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ClubSettings, clubSettingsSchema } from '@gpr/core';
import type { AuthUser } from '../auth/auth.types';
import { ClubScoped, CurrentUser, Roles } from '../auth/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ClubsService } from './clubs.service';

@Controller('clubs')
export class ClubsController {
  constructor(private readonly clubs: ClubsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.clubs.list(user);
  }

  @Get(':clubId')
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN)
  @ClubScoped()
  get(@Param('clubId', ParseUUIDPipe) clubId: string, @CurrentUser() user: AuthUser) {
    return this.clubs.get(clubId, user);
  }

  /** Paramètres modifiables par le club (phase 1 : activation du bonus heures creuses). */
  @Patch(':clubId/settings')
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN)
  @ClubScoped()
  updateSettings(
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @Body(new ZodValidationPipe(clubSettingsSchema)) body: ClubSettings,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clubs.updateSettings(clubId, body, user);
  }
}
