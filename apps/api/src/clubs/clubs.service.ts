import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { ClubSettings } from '@gpr/core';
import type { AuthUser } from '../auth/auth.types';
import { AuditService } from '../common/audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

const PUBLIC_FIELDS = {
  id: true,
  name: true,
  slug: true,
  city: true,
  offPeakBonusEnabled: true,
} as const;

@Injectable()
export class ClubsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Liste filtrée selon le rôle : un admin club ne voit que son club. */
  list(user: AuthUser) {
    switch (user.role) {
      case Role.SUPER_ADMIN:
        return this.prisma.club.findMany({
          orderBy: { name: 'asc' },
          select: { ...PUBLIC_FIELDS, isActive: true, timezone: true },
        });
      case Role.CLUB_ADMIN:
        return this.prisma.club.findMany({
          where: { id: user.clubId! },
          select: { ...PUBLIC_FIELDS, timezone: true },
        });
      default:
        return this.prisma.club.findMany({
          where: { isActive: true },
          orderBy: { name: 'asc' },
          select: PUBLIC_FIELDS,
        });
    }
  }

  /** Détail d'un club. L'état du connecteur n'est visible que du super admin (jamais les identifiants). */
  async get(clubId: string, user: AuthUser) {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: {
        ...PUBLIC_FIELDS,
        timezone: true,
        isActive: true,
        counterAutoValidate: true,
        connector:
          user.role === Role.SUPER_ADMIN
            ? {
                select: {
                  provider: true,
                  externalClubId: true,
                  syncIntervalMinutes: true,
                  lastSyncAt: true,
                  lastSyncStatus: true,
                  lastSyncError: true,
                },
              }
            : false,
      },
    });
    if (!club) throw new NotFoundException('Club introuvable');
    return club;
  }

  async updateSettings(clubId: string, settings: ClubSettings, user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.club.findUnique({
        where: { id: clubId },
        select: { offPeakBonusEnabled: true, counterAutoValidate: true },
      });
      if (!before) throw new NotFoundException('Club introuvable');
      const after = await tx.club.update({
        where: { id: clubId },
        data: settings,
        select: { ...PUBLIC_FIELDS, counterAutoValidate: true },
      });
      await this.audit.log(
        {
          actor: { id: user.id, role: user.role },
          action: 'club.settings.update',
          entityType: 'Club',
          entityId: clubId,
          clubId,
          before,
          after: settings,
        },
        tx,
      );
      return after;
    });
  }
}
