import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DEFAULT_VIP_SETTINGS,
  parseCodeList,
  PartnerInput,
  VIP_LOW_STOCK_THRESHOLD,
  VipGrantInput,
  VipSettings,
  vipSettingsSchema,
} from '@gpr/core';
import type { AuthUser } from '../auth/auth.types';
import { AuditService } from '../common/audit/audit.service';
import { MailService } from '../common/mail/mail.service';
import { NotificationsService } from '../gamification/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RulesService } from '../rules/rules.service';

const SETTINGS_KEY = 'vip';
const DAY = 86_400_000;
const addMonthsUTC = (d: Date, m: number) => {
  const x = new Date(d.getTime());
  x.setUTCMonth(x.getUTCMonth() + m);
  return x;
};

/**
 * Carte VIP : accès gratuit au niveau le plus élevé (Platine), achat simple d'un an
 * (paiement branché à l'activation) ou attribution manuelle par le super admin.
 * Avantage : codes promo de partenaires extérieurs, valables une semaine.
 * Tant que la carte est désactivée, rien n'est visible ni attribué côté joueur.
 */
@Injectable()
export class VipService {
  private readonly logger = new Logger(VipService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: RulesService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) {}

  // ── Réglages ──
  async settings(): Promise<VipSettings> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: SETTINGS_KEY } });
    const parsed = vipSettingsSchema.safeParse({
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
    // À l'activation : les joueurs déjà Platine reçoivent leur carte tout de suite.
    if (input.enabled && !before.enabled) await this.grantPlatinum();
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

  async status(userId: string, now = new Date()) {
    const s = await this.settings();
    if (!s.enabled) return { enabled: false as const };
    const memberships = await this.prisma.vipMembership.findMany({
      where: { userId, endsAt: { gt: now } },
      orderBy: { endsAt: 'desc' },
      select: { source: true, startsAt: true, endsAt: true },
    });
    const active = memberships.filter((m) => m.startsAt <= now);
    const { levels } = await this.rules.getActive();
    const top = [...levels].sort((a, b) => b.minGpr - a.minGpr)[0];
    return {
      enabled: true as const,
      active: active.length > 0,
      until: memberships[0]?.endsAt ?? null,
      sources: [...new Set(active.map((m) => m.source))],
      freeLevel: { code: top.code, label: top.label, minGpr: top.minGpr },
      priceCents: s.priceCents,
      purchaseEnabled: s.purchaseEnabled,
    };
  }

  private async isVip(userId: string, now = new Date()) {
    return (await this.prisma.vipMembership.count({ where: this.activeWhere(userId, now) })) > 0;
  }

  // ── Attribution ──
  /** Joueurs au niveau le plus élevé sans carte « Platine » en cours : carte d'un an. Idempotent. */
  async grantPlatinum(now = new Date()): Promise<number> {
    if (!(await this.settings()).enabled) return 0;
    const { levels } = await this.rules.getActive();
    const top = [...levels].sort((a, b) => b.minGpr - a.minGpr)[0];
    const since = new Date(now.getTime() - 365 * DAY);
    // Même calcul que le niveau : points gagnés sur 12 mois glissants, validés.
    const rows = await this.prisma.$queryRaw<{ userId: string }[]>`
      SELECT l."userId" FROM "LedgerEntry" l
      JOIN "User" u ON u.id = l."userId" AND u.role = 'PLAYER' AND u."anonymizedAt" IS NULL
      WHERE l.type IN ('EARN','BONUS','CHALLENGE','REVERSAL') AND l."earnedAt" > ${since} AND l."earnedAt" <= ${now} AND l."availableAt" <= ${now}
      GROUP BY l."userId" HAVING SUM(l.amount) >= ${top.minGpr}`;
    let granted = 0;
    for (const { userId } of rows) {
      const current = await this.prisma.vipMembership.findFirst({
        where: { userId, source: 'PLATINUM', endsAt: { gt: now } },
      });
      if (current) continue;
      await this.prisma.vipMembership.create({
        data: {
          userId,
          source: 'PLATINUM',
          startsAt: now,
          endsAt: addMonthsUTC(now, 12),
          reason: `Niveau ${top.label}`,
        },
      });
      granted++;
      await this.notifications.notify({
        userId,
        type: 'ACCOUNT',
        title: 'Votre carte VIP est activée',
        body: `Grâce à votre niveau ${top.label}, profitez pendant 1 an des offres de nos partenaires.`,
        data: { screen: 'vip' },
        dedupeKey: `vip:platinum:${userId}:${now.toISOString().slice(0, 10)}`,
      });
    }
    if (granted) this.logger.log(`Carte VIP : ${granted} joueur(s) Platine`);
    return granted;
  }

  /** Attribution manuelle (cadeau, vente au comptoir…) : prolonge la carte en cours. */
  async grantManual(userId: string, input: VipGrantInput, actor: AuthUser) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, role: 'PLAYER', anonymizedAt: null },
    });
    if (!user) throw new NotFoundException('Joueur introuvable');
    const now = new Date();
    const last = await this.prisma.vipMembership.findFirst({
      where: { userId, endsAt: { gt: now } },
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

  /** Achat en ligne : branché à l'activation (compte Stripe du GPR, conditions générales de vente). */
  async purchase(_userId: string) {
    const s = await this.requireEnabled();
    if (!s.purchaseEnabled) {
      throw new ServiceUnavailableException(
        'Le paiement en ligne sera bientôt disponible. Renseignez-vous à l’accueil de votre club.',
      );
    }
    // TODO(activation VIP) : création d'une session de paiement Stripe (60 €, 1 an) puis, sur
    // confirmation du paiement (webhook signé), VipMembership { source: PURCHASE, paymentRef }.
    throw new ServiceUnavailableException('Paiement en ligne non configuré.');
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
    const [settings, partners, stats, members] = await Promise.all([
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
    ]);
    return {
      settings,
      activeMembers: Object.fromEntries(members.map((m) => [m.source, m._count.userId])),
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
