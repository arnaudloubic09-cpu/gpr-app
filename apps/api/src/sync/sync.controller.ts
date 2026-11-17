import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { ClubScoped, CurrentUser, Roles } from '../auth/decorators';
import { AuditService } from '../common/audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { SyncService } from './sync.service';

/** Supervision des synchronisations : réservé au super admin. */
@Controller('clubs/:clubId')
@Roles(Role.SUPER_ADMIN)
@ClubScoped()
export class SyncController {
  constructor(
    private readonly sync: SyncService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Relance manuelle d'une synchronisation. */
  @Post('sync')
  async trigger(@Param('clubId', ParseUUIDPipe) clubId: string, @CurrentUser() user: AuthUser) {
    const outcome = await this.sync.syncClub(clubId, { triggeredById: user.id });
    await this.audit.log({
      actor: { id: user.id, role: user.role },
      action: 'club.sync.trigger',
      entityType: 'Club',
      entityId: clubId,
      clubId,
      after: { status: outcome.status },
    });
    return outcome;
  }

  @Get('sync-runs')
  runs(@Param('clubId', ParseUUIDPipe) clubId: string) {
    return this.prisma.syncRun.findMany({
      where: { clubId },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
  }
}
