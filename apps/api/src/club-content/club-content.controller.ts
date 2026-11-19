import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  AnnouncementInput,
  announcementInputSchema,
  LocalPartnerInput,
  localPartnerInputSchema,
} from '@gpr/core';
import type { AuthUser } from '../auth/auth.types';
import { ClubScoped, CurrentUser, Public, Roles } from '../auth/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ClubContentService } from './club-content.service';

/** Gestion par le club : info du moment et partenaires locaux. */
@Controller('clubs/:clubId/admin')
@Roles(Role.CLUB_ADMIN, Role.SUPER_ADMIN)
@ClubScoped()
export class ClubContentAdminController {
  constructor(private readonly content: ClubContentService) {}

  @Get('announcements')
  announcements(@Param('clubId', ParseUUIDPipe) clubId: string) {
    return this.content.listAnnouncements(clubId);
  }

  @Post('announcements')
  createAnnouncement(
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @Body(new ZodValidationPipe(announcementInputSchema)) body: AnnouncementInput,
    @CurrentUser() u: AuthUser,
  ) {
    return this.content.saveAnnouncement(clubId, null, body, u);
  }

  @Patch('announcements/:id')
  updateAnnouncement(
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(announcementInputSchema)) body: AnnouncementInput,
    @CurrentUser() u: AuthUser,
  ) {
    return this.content.saveAnnouncement(clubId, id, body, u);
  }

  @Get('local-partners')
  partners(@Param('clubId', ParseUUIDPipe) clubId: string) {
    return this.content.listPartners(clubId);
  }

  @Post('local-partners')
  createPartner(
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @Body(new ZodValidationPipe(localPartnerInputSchema)) body: LocalPartnerInput,
    @CurrentUser() u: AuthUser,
  ) {
    return this.content.savePartner(clubId, null, body, u);
  }

  @Patch('local-partners/:id')
  updatePartner(
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(localPartnerInputSchema)) body: LocalPartnerInput,
    @CurrentUser() u: AuthUser,
  ) {
    return this.content.savePartner(clubId, id, body, u);
  }
}

/** Côté joueur. */
@Controller('me')
@Roles(Role.PLAYER)
export class MeClubContentController {
  constructor(private readonly content: ClubContentService) {}

  @Get('announcement')
  async announcement(@CurrentUser() u: AuthUser) {
    return { announcement: await this.content.currentForPlayer(u.id) };
  }

  @Get('local-partners')
  partners(@CurrentUser() u: AuthUser) {
    return this.content.forPlayer(u.id);
  }
}

/** Logos des partenaires : publics (affichés dans l'app et le back-office). */
@Controller('local-partners')
export class LocalPartnerLogoController {
  constructor(private readonly content: ClubContentService) {}

  @Public()
  @Get(':id/logo')
  @Header('Cache-Control', 'public, max-age=86400')
  @Header('Cross-Origin-Resource-Policy', 'cross-origin')
  async logo(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: { setHeader: (k: string, v: string) => void },
  ) {
    const { logo, logoMime } = await this.content.logo(id);
    res.setHeader('Content-Type', logoMime!);
    return new StreamableFile(Buffer.from(logo!));
  }
}
