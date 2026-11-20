import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
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
import { Throttle } from '@nestjs/throttler';
import { ClubContentService } from './club-content.service';
import { PartnerPortalService } from './partner-portal.service';

/** Gestion par le club : info du moment et partenaires locaux. */
@Controller('clubs/:clubId/admin')
@Roles(Role.CLUB_ADMIN, Role.SUPER_ADMIN)
@ClubScoped()
export class ClubContentAdminController {
  constructor(
    private readonly content: ClubContentService,
    private readonly portal: PartnerPortalService,
  ) {}

  @Get('announcements/audience')
  audience(@Param('clubId', ParseUUIDPipe) clubId: string) {
    return this.content.announcementAudience(clubId);
  }

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
    return this.portal.adminList(clubId);
  }

  /** Nouveau lien personnel pour le partenaire (l'ancien ne fonctionne plus). */
  @Post('local-partners/:id/portal-link')
  regeneratePortal(
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthUser,
  ) {
    return this.portal.regeneratePortal(clubId, id, u);
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
  constructor(
    private readonly content: ClubContentService,
    private readonly portal: PartnerPortalService,
  ) {}

  @Get('announcement')
  async announcement(@CurrentUser() u: AuthUser) {
    return { announcement: await this.content.currentForPlayer(u.id) };
  }

  @Get('local-partners')
  partners(@CurrentUser() u: AuthUser) {
    return this.content.forPlayer(u.id);
  }

  /** « Utiliser l'avantage » : QR code à usage unique à faire scanner par le partenaire. */
  @Post('local-partners/:id/use')
  use(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) {
    return this.portal.createUse(u.id, id);
  }

  @Get('local-partner-uses/:token')
  useStatus(@Param('token') token: string, @CurrentUser() u: AuthUser) {
    return this.portal.useStatus(u.id, token);
  }
}

/** Page du partenaire local (sans compte : reconnu par son lien personnel, envoyé dans l'en-tête). */
@Controller('partner-portal')
@Public()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class PartnerPortalController {
  constructor(private readonly portal: PartnerPortalService) {}

  @Get()
  me(@Headers('x-partner-token') token?: string) {
    return this.portal.portal(token);
  }

  @Get('uses/:token')
  preview(@Param('token') use: string, @Headers('x-partner-token') token?: string) {
    return this.portal.previewUse(token, use);
  }

  @Post('uses/:token')
  @HttpCode(HttpStatus.OK)
  validate(@Param('token') use: string, @Headers('x-partner-token') token?: string) {
    return this.portal.validateUse(token, use);
  }
}

/** Vue GPR : utilisation des avantages chez les partenaires locaux de tous les clubs. */
@Controller('admin/local-partners')
@Roles(Role.SUPER_ADMIN)
export class AdminLocalPartnersController {
  constructor(private readonly portal: PartnerPortalService) {}

  @Get()
  overview() {
    return this.portal.overview();
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
