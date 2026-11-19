import { Injectable, NotFoundException } from '@nestjs/common';
import { decodeLogo } from '../club-content/club-content.service';
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
  logoUpdatedAt: true,
} as const;

/** Remplace la date de mise à jour du logo par son adresse (null s'il n'y a pas de logo). */
function withLogo<T extends { id: string; logoUpdatedAt: Date | null }>(c: T) {
  const { logoUpdatedAt, ...rest } = c;
  return {
    ...rest,
    logoUrl: logoUpdatedAt ? `/clubs/${c.id}/logo?v=${logoUpdatedAt.getTime()}` : null,
  };
}

@Injectable()
export class ClubsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Liste filtrée selon le rôle : un admin club ne voit que son club. */
  async list(user: AuthUser) {
    return (await this.listRaw(user)).map(withLogo);
  }

  private listRaw(user: AuthUser) {
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
    return withLogo(club);
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

  async setLogo(clubId: string, logo: string | null, user: AuthUser) {
    const data = logo
      ? { ...decodeLogo(logo), logoUpdatedAt: new Date() }
      : { logo: null, logoMime: null, logoUpdatedAt: null };
    const club = await this.prisma.club.update({
      where: { id: clubId },
      data,
      select: PUBLIC_FIELDS,
    });
    await this.audit.log({
      actor: { id: user.id, role: user.role },
      action: logo ? 'club.logo.update' : 'club.logo.delete',
      entityType: 'Club',
      entityId: clubId,
      clubId,
    });
    return withLogo(club);
  }

  async logo(clubId: string) {
    const c = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { logo: true, logoMime: true },
    });
    if (!c?.logo || !c.logoMime) throw new NotFoundException('Logo introuvable');
    return { logo: c.logo, logoMime: c.logoMime };
  }
}
