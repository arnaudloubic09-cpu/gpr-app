import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { MeResponse, UpdateProfile, updateProfileSchema } from '@gpr/core';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser, Roles } from '../auth/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { LedgerService } from '../ledger/ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountLinkService } from './account-link.service';

const ME_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  clubId: true,
  favoriteClubId: true,
} as const;

@Controller('me')
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly accountLink: AccountLinkService,
  ) {}

  @Get()
  async me(@CurrentUser() current: AuthUser): Promise<MeResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: current.id },
      select: ME_SELECT,
    });
    if (!user) throw new NotFoundException();
    return user;
  }

  @Patch()
  async update(
    @CurrentUser() current: AuthUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfile,
  ): Promise<MeResponse> {
    if (body.favoriteClubId) {
      const club = await this.prisma.club.findFirst({
        where: { id: body.favoriteClubId, isActive: true },
      });
      if (!club) throw new BadRequestException('Club inconnu');
    }
    return this.prisma.user.update({ where: { id: current.id }, data: body, select: ME_SELECT });
  }

  /** Solde en points GPR : disponibles, en attente (H+2), expirant dans les 30 jours. */
  @Get('balance')
  @Roles(Role.PLAYER)
  balance(@CurrentUser() user: AuthUser) {
    return this.ledger.balance(user.id);
  }

  /** Historique des transactions (pagination par curseur). */
  @Get('transactions')
  @Roles(Role.PLAYER)
  transactions(
    @CurrentUser() user: AuthUser,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('cursor', new ParseUUIDPipe({ optional: true })) cursor?: string,
  ) {
    return this.ledger.transactions(user.id, Math.min(Math.max(limit, 1), 100), cursor);
  }

  @Get('links')
  @Roles(Role.PLAYER)
  links(@CurrentUser() user: AuthUser) {
    return this.accountLink.links(user.id);
  }

  /** Recherche du compte Playtomic / Doinsport correspondant à l'email ou au téléphone du joueur. */
  @Post('link-account')
  @Roles(Role.PLAYER)
  @HttpCode(HttpStatus.OK)
  link(@CurrentUser() user: AuthUser) {
    return this.accountLink.link(user.id);
  }
}
