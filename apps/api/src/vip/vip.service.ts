import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DEFAULT_VIP_SETTINGS,
  parseCodeList,
  PartnerInput,
  VIP_LOW_STOCK_THRESHOLD,
  VipGrantInput,
  VIP_WINDOW_DAYS,
  VipSettings,
  vipSettingsBase,
} from '@gpr/core';
import type { AuthUser } from '../auth/auth.types';
import { AuditService } from '../common/audit/audit.service';
import { MailService } from '../common/mail/mail.service';
import { NotificationsService } from '../gamification/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

const SETTINGS_KEY = 'vip';
const DAY = 86_400_000;
const addMonthsUTC = (d: Date, m: number) => {
  const x = new Date(d.getTime());
  x.setUTCMonth(x.getUTCMonth() + m);
  return x;
};

/**
 * Carte VIP gratuite : le joueur est VIP tant qu'il a joué au moins `gamesRequired` parties
 * (10 par défaut) dans les clubs du GPR sur les 12 derniers mois (statut glissant).
 * Le super admin peut aussi attribuer la carte à la main.
 * Avantage : codes promo de partenaires extérieurs, valables une semaine.
 * Tant que la carte est désactivée, rien n'est visible ni attribué côté joueur.
 */
@Injectable()
export class VipService {
  private readonly logger = new Logger(VipService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) {}

  // ── Réglages ──
  async settings(): Promise<VipSettings> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: SETTINGS_KEY } });
    // Les anciens réglages (prix, paiement) sont ignorés.
    const parsed = vipSettingsBase.safeParse({
      ...DEFAULT_VIP_SETTINGS,
      ...((row?.value as object) ?? {}),
    });
    return parsed.success ? parsed.data : DEFAULT_VIP_SETTINGS;
  }

  async updateSettings(input: VipSettings, actor: AuthUser) {
    const before = await this.settings();
    await this.prisma.appSetting.upsert({
      where: { key: SETTINGS_KEY },
      create: { key: SETTINGS_KEY, value: input, updatedById: actor.id },
      update: { value: input, updatedById: actor.id },
    });
    await this.audit.log({
      actor: { id: actor.id, role: actor.role },
      action: 'vip.settings.update',
      entityType: 'AppSetting',
      entityId: SETTINGS_KEY,
      before,
      after: input,
    });
    // À l'activation : les joueurs qui remplissent déjà la condition sont prévenus tout de suite.
    if (input.enabled && !before.enabled) await this.refreshGamesMemberships();
    return this.settings();
  }

  private async requireEnabled() {
    const s = await this.settings();
    if (!s.enabled) throw new NotFoundException('La carte VIP n’est pas encore disponible.');
    return s;
  }

  // ── Statut ──
  private activeWhere(userId: string, now: Date): Prisma.VipMembershipWhereInput {
    return { userId, startsAt: { lte: now }, endsAt: { gt: now } };
  }

  /**
   * Parties validées du joueur sur les 12 derniers mois (une réservation = une partie, même si
   * ses points ont été recalculés ; les parties annulées ne comptent pas), de la plus récente à la plus ancienne.
   */
  private async recentGames(userId: string, now: Date): Promise<Date[]> {
    const since = new Date(now.getTime() - VIP_WINDOW_DAYS * DAY);
    const rows = await this.prisma.$queryRaw<{ playedAt: Date }[]>`
      SELECT MIN(l."earnedAt") AS "playedAt" FROM "LedgerEntry" l
      WHERE l."userId" = ${userId}::uuid AND l.type = 'EARN' AND l."sourceType" = 'BOOKING'
        AND l."earnedAt" > ${since} AND l."earnedAt" <= ${now} AND l."availableAt" <= ${now}
        AND NOT EXISTS (SELECT 1 FROM "LedgerEntry" r WHERE r."reversesEntryId" = l.id)
      GROUP BY l."sourceId" ORDER BY "playedAt" DESC`;
    return rows.map((r) => r.playedAt);
  }

  /** Statut « parties » : actif si assez de parties ; `until` = date de fin si le joueur ne rejoue plus. */
  private gamesStatus(games: Date[], required: number) {
    const active = games.length >= required;
    return {
      games: games.length,
      active,
      until: active ? new Date(games[required - 1].getTime() + VIP_WINDOW_DAYS * DAY) : null,
    };
  }

  async status(userId: string, now = new Date()) {
    const s = await this.settings();
    if (!s.enabled) return { enabled: false as const };
    const [games, manual] = await Promise.all([
      this.recentGames(userId, now),
      this.prisma.vipMembership.findFirst({
        where: { ...this.activeWhere(userId, now), source: 'MANUAL' },
        orderBy: { endsAt: 'desc' },
        select: { endsAt: true },
      }),
    ]);
    const g = this.gamesStatus(games, s.gamesRequired);
    const sources = [...(g.active ? ['GAMES'] : []), ...(manual ? ['MANUAL'] : [])];
    const untils = [g.until, manual?.endsAt].filter((d): d is Date => !!d);
    return {
      enabled: true as const,
      active: sources.length > 0,
      sources,
      /** Date jusqu'à laquelle la carte reste valable même sans nouvelle partie. */
      until: untils.length ? new Date(Math.max(...untils.map((d) => d.getTime()))) : null,
      games: g.games,
      gamesRequired: s.gamesRequired,
    };
  }

  private async isVip(userId: string, now = new Date()) {
    const manual = await this.prisma.vipMembership.count({
      where: { ...this.activeWhere(userId, now), source: 'MANUAL' },
    });
    if (manual > 0) return true;
    const { gamesRequired } = await this.settings();
    return (await this.recentGames(userId, now)).length >= gamesRequired;
  }

  // ── Attribution ──
  /**
   * Tâche quotidienne : enregistre la période VIP des joueurs qui remplissent la condition de
   * parties (statistiques du back-office) et prévient ceux qui deviennent VIP. Idempotent.
   */
  async refreshGamesMemberships(now = new Date()): Promise<number> {
    const s = await this.settings();
    if (!s.enabled) return 0;
    const since = new Date(now.getTime() - VIP_WINDOW_DAYS * DAY);
    const candidates = await this.prisma.$queryRaw<{ userId: string }[]>`
      SELECT l."userId" FROM "LedgerEntry" l
      JOIN "User" u ON u.id = l."userId" AND u.role = 'PLAYER' AND u."anonymizedAt" IS NULL
      WHERE l.type = 'EARN' AND l."sourceType" = 'BOOKING'
        AND l."earnedAt" > ${since} AND l."earnedAt" <= ${now} AND l."availableAt" <= ${now}
        AND NOT EXISTS (SELECT 1 FROM "LedgerEntry" r WHERE r."reversesEntryId" = l.id)
      GROUP BY l."userId" HAVING COUNT(DISTINCT l."sourceId") >= ${s.gamesRequired}`;
    let newcomers = 0;
    for (const { userId } of candidates) {
      const g = this.gamesStatus(await this.recentGames(userId, now), s.gamesRequired);
      if (!g.active || !g.until) continue;
      const current = await this.prisma.vipMembership.findFirst({
        where: { ...this.activeWhere(userId, now), source: 'GAMES' },
      });
      if (current) {
        if (current.endsAt.getTime() !== g.until.getTime())
          await this.prisma.vipMembership.update({
            where: { id: current.id },
            data: { endsAt: g.until },
          });
        continue;
      }
      await this.prisma.vipMembership.create({
        data: {
          userId,
          source: 'GAMES',
          startsAt: now,
          endsAt: g.until,
          reason: `${s.gamesRequired} parties sur 12 mois`,
        },
      });
      newcomers++;
      await this.notifications.notify({
        userId,
        type: 'ACCOUNT',
        title: 'Votre carte VIP est activée',
        body: `Bravo pour vos ${s.gamesRequired} parties ! Profitez des offres de nos partenaires tant que vous jouez régulièrement.`,
        data: { screen: 'vip' },
        dedupeKey: `vip:games:${userId}:${now.toISOString().slice(0, 10)}`,
      });
    }
    if (newcomers) this.logger.log(`Carte VIP : ${newcomers} nouveau(x) membre(s)`);
    return newcomers;
  }

  /** Attribution manuelle (geste commercial…) : prolonge la carte manuelle en cours. */
  async grantManual(userId: string, input: VipGrantInput, actor: AuthUser) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, role: 'PLAYER', anonymizedAt: null },
    });
    if (!user) throw new NotFoundException('Joueur introuvable');
    const now = new Date();
    const last = await this.prisma.vipMembership.findFirst({
      where: { userId, source: 'MANUAL', endsAt: { gt: now } },
      orderBy: { endsAt: 'desc' },
    });
    const startsAt = last ? last.endsAt : now;
    const m = await this.prisma.vipMembership.create({
      data: {
        userId,
        source: 'MANUAL',
        startsAt,
        endsAt: addMonthsUTC(startsAt, input.months),
        reason: input.reason,
        grantedById: actor.id,
      },
    });
    await this.audit.log({
      actor: { id: actor.id, role: actor.role },
      action: 'vip.grant',
      entityType: 'User',
      entityId: userId,
      after: { months: input.months, reason: input.reason, until: m.endsAt },
    });
    if ((await this.settings()).enabled) {
      await this.notifications.notify({
        userId,
        type: 'ACCOUNT',
        title: 'Votre carte VIP est activée',
        body: `Valable jusqu’au ${m.endsAt.toLocaleDateString('fr-FR')}.`,
        data: { screen: 'vip' },
        dedupeKey: `vip:manual:${m.id}`,
      });
    }
    return m;
  }

  // ── Partenaires et codes (joueur) ──
  async partnersForPlayer() {
    await this.requireEnabled();
    const partners = await this.prisma.partner.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    const remaining = await this.prisma.partnerCode.groupBy({
      by: ['partnerId'],
      where: { partnerId: { in: partners.map((p) => p.id) }, assignedAt: null },
      _count: true,
    });
    return partners.map((p) => ({
      id: p.id,
      name: p.name,
      offer: p.offer,
      description: p.description,
      websiteUrl: p.websiteUrl,
      codeValidityDays: p.codeValidityDays,
      available: (remaining.find((r) => r.partnerId === p.id)?._count ?? 0) > 0,
    }));
  }

  async myCodes(userId: string) {
    await this.requireEnabled();
    return this.prisma.partnerCode.findMany({
      where: { assignedToId: userId },
      orderBy: { assignedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        code: true,
        assignedAt: true,
        expiresAt: true,
        partner: { select: { id: true, name: true, offer: true, websiteUrl: true } },
      },
    });
  }

  /** Attribue le prochain code libre du partenaire (jamais deux fois le même, même en simultané). */
  async requestCode(userId: string, partnerId: string) {
    await this.requireEnabled();
    const now = new Date();
    if (!(await this.isVip(userId, now))) throw new ForbiddenException('Réservé aux membres VIP.');
    const partner = await this.prisma.partner.findFirst({
      where: { id: partnerId, isActive: true },
    });
    if (!partner) throw new NotFoundException('Partenaire introuvable');

    const assigned = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
      if (partner.maxCodesPerMember) {
        const count = await tx.partnerCode.count({ where: { partnerId, assignedToId: userId } });
        if (count >= partner.maxCodesPerMember) {
          throw new ConflictException({
            code: 'LIMIT_REACHED',
            message: `Vous avez déjà obtenu le nombre maximal de codes pour ${partner.name}.`,
          });
        }
      }
      const expiresAt = new Date(now.getTime() + partner.codeValidityDays * DAY);
      const rows = await tx.$queryRaw<{ id: string; code: string; expiresAt: Date }[]>`
        UPDATE "PartnerCode" SET "assignedToId" = ${userId}::uuid, "assignedAt" = ${now}, "expiresAt" = ${expiresAt}
        WHERE id = (
          SELECT id FROM "PartnerCode" WHERE "partnerId" = ${partnerId}::uuid AND "assignedAt" IS NULL
          ORDER BY "importedAt", id FOR UPDATE SKIP LOCKED LIMIT 1
        )
        RETURNING id, code, "expiresAt"`;
      return rows[0] ?? null;
    });
    await this.checkStock(partner.id, partner.name, partner.lowStockAlertAt);
    if (!assigned) {
      throw new ConflictException({
        code: 'NO_CODE',
        message: `Plus de code disponible pour ${partner.name} pour le moment. Revenez bientôt !`,
      });
    }
    return {
      ...assigned,
      partner: {
        id: partner.id,
        name: partner.name,
        offer: partner.offer,
        websiteUrl: partner.websiteUrl,
      },
    };
  }

  /** Liste presque épuisée : un seul email aux super admins, réarmé au prochain import. */
  private async checkStock(partnerId: string, name: string, alertedAt: Date | null) {
    if (alertedAt) return;
    const remaining = await this.prisma.partnerCode.count({
      where: { partnerId, assignedAt: null },
    });
    if (remaining >= VIP_LOW_STOCK_THRESHOLD) return;
    const armed = await this.prisma.partner.updateMany({
      where: { id: partnerId, lowStockAlertAt: null },
      data: { lowStockAlertAt: new Date() },
    });
    if (!armed.count) return;
    const admins = await this.prisma.user.findMany({
      where: { role: 'SUPER_ADMIN', disabledAt: null },
      select: { email: true },
    });
    await this.mail
      .sendAlert(
        admins.map((a) => a.email),
        `Codes partenaire bientôt épuisés : ${name}`,
        `Il reste ${remaining} code(s) promo pour le partenaire « ${name} ».\n\nDemandez une nouvelle liste au partenaire puis importez-la dans le back-office (Carte VIP → Partenaires).`,
      )
      .catch((e) => this.logger.error(`Alerte de stock non envoyée : ${(e as Error).message}`));
  }

  // ── Administration ──
  async adminOverview(now = new Date()) {
    const [settings, partners, stats, members, distinctMembers] = await Promise.all([
      this.settings(),
      this.prisma.partner.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.partnerCode.groupBy({
        by: ['partnerId'],
        _count: { _all: true, assignedAt: true },
      }),
      this.prisma.vipMembership.groupBy({
        by: ['source'],
        where: { startsAt: { lte: now }, endsAt: { gt: now } },
        _count: { userId: true },
      }),
      this.prisma.vipMembership.findMany({
        where: { startsAt: { lte: now }, endsAt: { gt: now } },
        distinct: ['userId'],
        select: { userId: true },
      }),
    ]);
    return {
      settings,
      activeMembers: Object.fromEntries(members.map((m) => [m.source, m._count.userId])),
      activeTotal: distinctMembers.length,
      partners: partners.map((p) => {
        const s = stats.find((x) => x.partnerId === p.id);
        const total = s?._count._all ?? 0;
        const assigned = s?._count.assignedAt ?? 0;
        return { ...p, codes: { total, assigned, remaining: total - assigned } };
      }),
    };
  }

  async createPartner(input: PartnerInput, actor: AuthUser) {
    const p = await this.prisma.partner.create({ data: input });
    await this.audit.log({
      actor: { id: actor.id, role: actor.role },
      action: 'partner.create',
      entityType: 'Partner',
      entityId: p.id,
      after: input,
    });
    return p;
  }

  async updatePartner(id: string, input: PartnerInput, actor: AuthUser) {
    const before = await this.prisma.partner.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Partenaire introuvable');
    const p = await this.prisma.partner.update({
      where: { id },
      data: { description: null, websiteUrl: null, maxCodesPerMember: null, ...input },
    });
    await this.audit.log({
      actor: { id: actor.id, role: actor.role },
      action: 'partner.update',
      entityType: 'Partner',
      entityId: id,
      before,
      after: input,
    });
    return p;
  }

  async importCodes(partnerId: string, raw: string, actor: AuthUser) {
    if (!(await this.prisma.partner.findUnique({ where: { id: partnerId } })))
      throw new NotFoundException('Partenaire introuvable');
    const codes = parseCodeList(raw);
    const { count } = await this.prisma.partnerCode.createMany({
      data: codes.map((code) => ({ partnerId, code })),
      skipDuplicates: true,
    });
    const remaining = await this.prisma.partnerCode.count({
      where: { partnerId, assignedAt: null },
    });
    if (remaining >= VIP_LOW_STOCK_THRESHOLD)
      await this.prisma.partner.update({
        where: { id: partnerId },
        data: { lowStockAlertAt: null },
      });
    // Les codes eux-mêmes ne sont pas écrits dans le journal.
    await this.audit.log({
      actor: { id: actor.id, role: actor.role },
      action: 'partner.codes.import',
      entityType: 'Partner',
      entityId: partnerId,
      after: { received: codes.length, added: count },
    });
    return { received: codes.length, added: count, duplicates: codes.length - count, remaining };
  }

  playerMemberships(userId: string) {
    return this.prisma.vipMembership.findMany({
      where: { userId },
      orderBy: { startsAt: 'desc' },
      select: { id: true, source: true, startsAt: true, endsAt: true, reason: true },
    });
  }
}
