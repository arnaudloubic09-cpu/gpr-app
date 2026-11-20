import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  PartnerInput,
  partnerCodesImportSchema,
  partnerInputSchema,
  VipGrantInput,
  vipGrantSchema,
  VipSettings,
  vipSettingsSchema,
} from '@gpr/core';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser, Roles } from '../auth/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { VipService } from './vip.service';

/** Carte VIP côté joueur (invisible tant qu'elle n'est pas activée). */
@Controller('me/vip')
@Roles(Role.PLAYER)
export class MeVipController {
  constructor(private readonly vip: VipService) {}

  @Get()
  status(@CurrentUser() u: AuthUser) {
    return this.vip.status(u.id);
  }

  @Get('partners')
  partners() {
    return this.vip.partnersForPlayer();
  }

  @Get('codes')
  codes(@CurrentUser() u: AuthUser) {
    return this.vip.myCodes(u.id);
  }

  @Post('partners/:partnerId/code')
  requestCode(@Param('partnerId', ParseUUIDPipe) partnerId: string, @CurrentUser() u: AuthUser) {
    return this.vip.requestCode(u.id, partnerId);
  }
}

/** Administration de la carte VIP et des partenaires (super admin). */
@Controller('admin/vip')
@Roles(Role.SUPER_ADMIN)
export class AdminVipController {
  constructor(private readonly vip: VipService) {}

  @Get()
  overview() {
    return this.vip.adminOverview();
  }

  @Put('settings')
  settings(
    @Body(new ZodValidationPipe(vipSettingsSchema)) body: VipSettings,
    @CurrentUser() u: AuthUser,
  ) {
    return this.vip.updateSettings(body, u);
  }

  @Post('partners')
  createPartner(
    @Body(new ZodValidationPipe(partnerInputSchema)) body: PartnerInput,
    @CurrentUser() u: AuthUser,
  ) {
    return this.vip.createPartner(body, u);
  }

  @Patch('partners/:partnerId')
  updatePartner(
    @Param('partnerId', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(partnerInputSchema)) body: PartnerInput,
    @CurrentUser() u: AuthUser,
  ) {
    return this.vip.updatePartner(id, body, u);
  }

  @Post('partners/:partnerId/codes')
  importCodes(
    @Param('partnerId', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(partnerCodesImportSchema)) body: { codes: string },
    @CurrentUser() u: AuthUser,
  ) {
    return this.vip.importCodes(id, body.codes, u);
  }

  @Get('players/:userId')
  memberships(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.vip.playerMemberships(userId);
  }

  @Post('players/:userId/grant')
  grant(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(vipGrantSchema)) body: VipGrantInput,
    @CurrentUser() u: AuthUser,
  ) {
    return this.vip.grantManual(userId, body, u);
  }
}
