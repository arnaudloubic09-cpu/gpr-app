import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { ClubLogoInput, clubLogoInputSchema, ClubSettings, clubSettingsSchema } from '@gpr/core';
import type { AuthUser } from '../auth/auth.types';
import { ClubScoped, CurrentUser, Public, Roles } from '../auth/decorators';
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

  /** Logo du club, déposé par l'admin du club (ou le super admin). */
  @Put(':clubId/logo')
  @Roles(Role.SUPER_ADMIN, Role.CLUB_ADMIN)
  @ClubScoped()
  setLogo(
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @Body(new ZodValidationPipe(clubLogoInputSchema)) body: ClubLogoInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clubs.setLogo(clubId, body.logo, user);
  }

  @Public()
  @Get(':clubId/logo')
  @Header('Cache-Control', 'public, max-age=86400')
  @Header('Cross-Origin-Resource-Policy', 'cross-origin')
  async logo(
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @Res({ passthrough: true }) res: { setHeader: (k: string, v: string) => void },
  ) {
    const { logo, logoMime } = await this.clubs.logo(clubId);
    res.setHeader('Content-Type', logoMime);
    return new StreamableFile(Buffer.from(logo));
  }
}
