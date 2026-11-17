import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { RedeemRequest, redeemSchema } from '@gpr/core';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser, Roles } from '../auth/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CouponsService } from './coupons.service';
import { RewardsService } from './rewards.service';

@Controller()
export class RewardsController {
  constructor(
    private readonly rewards: RewardsService,
    private readonly coupons: CouponsService,
  ) {}

  /** Catalogue d'un club, visible par tous les joueurs (solde commun à tout le groupement). */
  @Get('clubs/:clubId/rewards')
  catalog(@Param('clubId', ParseUUIDPipe) clubId: string) {
    return this.rewards.catalog(clubId);
  }

  @Post('rewards/:rewardId/redeem')
  @Roles(Role.PLAYER)
  @HttpCode(HttpStatus.CREATED)
  redeem(
    @Param('rewardId', ParseUUIDPipe) rewardId: string,
    @Body(new ZodValidationPipe(redeemSchema)) body: RedeemRequest,
    @CurrentUser() user: AuthUser,
  ) {
    return this.rewards.redeem(user.id, rewardId, body.requestId);
  }

  @Get('me/coupons')
  @Roles(Role.PLAYER)
  myCoupons(@CurrentUser() user: AuthUser, @Query('scope') scope?: string) {
    return this.coupons.listForUser(user.id, scope === 'history' ? 'history' : 'active');
  }

  @Post('me/coupons/:couponId/cancel')
  @Roles(Role.PLAYER)
  @HttpCode(HttpStatus.OK)
  cancel(@Param('couponId', ParseUUIDPipe) couponId: string, @CurrentUser() user: AuthUser) {
    return this.coupons.cancelByPlayer(user.id, couponId);
  }
}
