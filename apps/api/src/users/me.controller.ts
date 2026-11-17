import {
  Controller,
  DefaultValuePipe,
  Get,
  NotFoundException,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { MeResponse } from '@gpr/core';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser, Roles } from '../auth/decorators';
import { LedgerService } from '../ledger/ledger.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('me')
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  @Get()
  async me(@CurrentUser() current: AuthUser): Promise<MeResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: current.id },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, clubId: true },
    });
    if (!user) throw new NotFoundException();
    return user;
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
}
