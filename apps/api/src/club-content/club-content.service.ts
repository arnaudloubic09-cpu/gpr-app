import { randomBytes } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AnnouncementInput,
  LOCAL_PARTNER_ACTIVITY_DAYS,
  LocalPartnerInput,
  mapsUrl,
} from '@gpr/core';
import type { AuthUser } from '../auth/auth.types';
import { AuditService } from '../common/audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

const DAY = 86_400_000;
const MAGIC: Record<string, (b: Buffer) => boolean> = {
  'image/png': (b) =>
    b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/webp': (b) =>
    b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP',
};

/** Décode et vérifie un logo (le type déclaré doit correspondre au contenu réel du fichier). */
/** Jeton du lien personnel d'un partenaire local (page de suivi et de validation). */
export const newPortalToken = () => randomBytes(24).toString('base64url');

export function decodeLogo(dataUrl: string): { logo: Buffer; logoMime: string } {
  const [head, b64] = dataUrl.split(',');
  const mime = head.slice(5, head.indexOf(';'));
  const logo = Buffer.from(b64, 'base64');
  if (!MAGIC[mime]?.(logo))
    throw new BadRequestException('Le fichier ne correspond pas à une image PNG, JPEG ou WebP.');
  return { logo, logoMime: mime };
}

@Injectable()
export class ClubContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Info du moment ──
  async listAnnouncements(clubId: string) {
    const rows = await this.prisma.clubAnnouncement.findMany({
      where: { clubId },
      orderBy: { startsAt: 'desc' },
      include: { views: { select: { views: true } } },
    });
    return rows.map(({ views, ...a }) => ({
      ...a,
      stats: { players: views.length, views: views.reduce((s, v) => s + v.views, 0) },
    }));
  }

  async saveAnnouncement(
    clubId: string,
    id: string | null,
    input: AnnouncementInput,
    actor: AuthUser,
  ) {
    let row;
    if (id) {
      if (!(await this.prisma.clubAnnouncement.findFirst({ where: { id, clubId } })))
        throw new NotFoundException('Info introuvable');
      row = await this.prisma.clubAnnouncement.update({ where: { id }, data: input });
    } else {
      row = await this.prisma.clubAnnouncement.create({
        data: { ...input, clubId, createdById: actor.id },
      });
    }
    await this.audit.log({
      actor: { id: actor.id, role: actor.role },
      action: id ? 'announcement.update' : 'announcement.create',
      entityType: 'ClubAnnouncement',
      entityId: row.id,
      clubId,
      after: input,
    });
    return row;
  }

  /** Info en cours du club principal du joueur (la plus récente) ; enregistre l'affichage. */
  /** Nombre de joueurs dont ce club est le club principal (ceux qui verront l'info). */
  async announcementAudience(clubId: string) {
    const players = await this.prisma.user.count({
      where: { role: 'PLAYER', favoriteClubId: clubId, anonymizedAt: null },
    });
    return { players };
  }

  async currentForPlayer(userId: string, now = new Date()) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { favoriteClubId: true },
    });
    if (!user?.favoriteClubId) return null;
    const a = await this.prisma.clubAnnouncement.findFirst({
      where: {
        clubId: user.favoriteClubId,
        isActive: true,
        startsAt: { lte: now },
        endsAt: { gt: now },
        club: { isActive: true },
      },
      orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
      include: { club: { select: { id: true, name: true } } },
    });
    if (!a) return null;
    await this.prisma.announcementView.upsert({
      where: { announcementId_userId: { announcementId: a.id, userId } },
      create: { announcementId: a.id, userId },
      update: { views: { increment: 1 }, lastSeenAt: now },
    });
    return { id: a.id, title: a.title, body: a.body, endsAt: a.endsAt, club: a.club };
  }

  // ── Partenaires locaux ──
  private view(p: {
    id: string;
    clubId: string;
    name: string;
    offer: string;
    description: string | null;
    address: string;
    logoMime: string | null;
    isActive: boolean;
    updatedAt: Date;
  }) {
    return {
      id: p.id,
      clubId: p.clubId,
      name: p.name,
      offer: p.offer,
      description: p.description,
      address: p.address,
      mapsUrl: mapsUrl(p.address),
      logoUrl: p.logoMime ? `/local-partners/${p.id}/logo?v=${p.updatedAt.getTime()}` : null,
      isActive: p.isActive,
    };
  }

  private readonly listSelect = {
    id: true,
    clubId: true,
    name: true,
    offer: true,
    description: true,
    address: true,
    logoMime: true,
    isActive: true,
    updatedAt: true,
  } as const;

  async listPartners(clubId: string) {
    const rows = await this.prisma.localPartner.findMany({
      where: { clubId },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: this.listSelect,
    });
    return rows.map((p) => this.view(p));
  }

  async savePartner(clubId: string, id: string | null, input: LocalPartnerInput, actor: AuthUser) {
    const { logo, ...rest } = input;
    const data: Prisma.LocalPartnerUncheckedUpdateInput = {
      description: null,
      email: null,
      ...rest,
      ...(logo === null ? { logo: null, logoMime: null } : logo ? decodeLogo(logo) : {}),
    };
    let row;
    if (id) {
      if (!(await this.prisma.localPartner.findFirst({ where: { id, clubId } })))
        throw new NotFoundException('Partenaire introuvable');
      row = await this.prisma.localPartner.update({ where: { id }, data, select: this.listSelect });
    } else {
      row = await this.prisma.localPartner.create({
        data: {
          ...(data as Prisma.LocalPartnerUncheckedCreateInput),
          clubId,
          portalToken: newPortalToken(),
        },
        select: this.listSelect,
      });
    }
    await this.audit.log({
      actor: { id: actor.id, role: actor.role },
      action: id ? 'local-partner.update' : 'local-partner.create',
      entityType: 'LocalPartner',
      entityId: row.id,
      clubId,
      after: { ...rest, logoChanged: logo !== undefined },
    });
    return this.view(row);
  }

  async logo(id: string) {
    const p = await this.prisma.localPartner.findUnique({
      where: { id },
      select: { logo: true, logoMime: true },
    });
    if (!p?.logo || !p.logoMime) throw new NotFoundException();
    return p;
  }

  /**
   * Partenaires de tous les clubs actifs (club principal en premier). L'avantage d'un partenaire
   * est actif si le joueur a joué dans SON club au cours des 30 derniers jours (partie validée, non annulée).
   */
  /** Dernière partie validée (non annulée) du joueur dans chaque club, sur les 30 derniers jours. */
  async lastPlayedByClub(userId: string, now = new Date()): Promise<Map<string, Date>> {
    const since = new Date(now.getTime() - LOCAL_PARTNER_ACTIVITY_DAYS * DAY);
    const earns = await this.prisma.ledgerEntry.findMany({
      where: {
        userId,
        type: 'EARN',
        sourceType: 'BOOKING',
        earnedAt: { gte: since },
        availableAt: { lte: now },
        reversedBy: { none: {} },
      },
      select: { clubId: true, earnedAt: true },
    });
    const lastPlayed = new Map<string, Date>();
    for (const e of earns) {
      if (!e.clubId) continue;
      if (!lastPlayed.get(e.clubId) || lastPlayed.get(e.clubId)! < e.earnedAt)
        lastPlayed.set(e.clubId, e.earnedAt);
    }
    return lastPlayed;
  }

  async forPlayer(userId: string, now = new Date()) {
    const [user, partners, lastPlayed] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { favoriteClubId: true } }),
      this.prisma.localPartner.findMany({
        where: { isActive: true, club: { isActive: true } },
        orderBy: { name: 'asc' },
        select: { ...this.listSelect, club: { select: { id: true, name: true } } },
      }),
      this.lastPlayedByClub(userId, now),
    ]);
    return partners
      .map(({ club, ...p }) => {
        const last = lastPlayed.get(p.clubId);
        return {
          ...this.view(p),
          club,
          favorite: p.clubId === user?.favoriteClubId,
          active: !!last,
          activeUntil: last ? new Date(last.getTime() + LOCAL_PARTNER_ACTIVITY_DAYS * DAY) : null,
        };
      })
      .sort(
        (a, b) =>
          Number(b.favorite) - Number(a.favorite) ||
          a.club.name.localeCompare(b.club.name) ||
          a.name.localeCompare(b.name),
      );
  }
}
