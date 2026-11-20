import { createHash, randomBytes } from 'node:crypto';
import {
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LOCAL_PARTNER_USE_TTL_MINUTES } from '@gpr/core';
import type { AuthUser } from '../auth/auth.types';
import { AuditService } from '../common/audit/audit.service';
import { MailService } from '../common/mail/mail.service';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { ClubContentService, newPortalToken } from './club-content.service';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const TZ = 'Europe/Paris';

/** Début du mois (heure de Paris) contenant `d`, décalé de `add` mois. */
export function parisMonthStart(d: Date, add = 0): Date {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit' })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  const wall = Date.UTC(Number(p.year), Number(p.month) - 1 + add, 1);
  // Décalage de Paris à cet instant (1 h l'hiver, 2 h l'été)
  const offset = (t: number) => {
    const q = Object.fromEntries(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hourCycle: 'h23',
      })
        .formatToParts(new Date(t))
        .map((x) => [x.type, x.value]),
    );
    return Date.UTC(+q.year, +q.month - 1, +q.day, +q.hour) - t;
  };
  return new Date(wall - offset(wall - offset(wall)));
}

const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];
const monthLabel = (d: Date) =>
  `${MONTHS[Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, month: 'numeric' }).format(d)) - 1]} ${new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric' }).format(d)}`;

/** Prénom + initiale du nom : ce que voit le partenaire. */
const shortName = (u: { firstName: string | null; lastName: string | null }) =>
  [u.firstName ?? 'Joueur', u.lastName ? `${u.lastName[0].toUpperCase()}.` : ''].join(' ').trim();

export type UseStats = { thisMonth: number; lastMonth: number; total: number };

/**
 * Suivi des avantages des partenaires locaux :
 *  - le joueur affiche un QR code à usage unique (10 min) ;
 *  - le partenaire le scanne avec son téléphone, reconnu grâce à son lien personnel, et valide ;
 *  - le partenaire, le club et le GPR suivent les utilisations ; récapitulatif mensuel par email.
 */
@Injectable()
export class PartnerPortalService {
  private readonly logger = new Logger(PartnerPortalService.name);
  private readonly portalUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly content: ClubContentService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    config: ConfigService<Env, true>,
  ) {
    this.portalUrl = config.get('PORTAL_URL', { infer: true }).replace(/\/$/, '');
  }

  private portalLink = (token: string) => `${this.portalUrl}/partenaire/acces/${token}`;

  // ── Joueur ──
  async createUse(userId: string, partnerId: string, now = new Date()) {
    const partner = await this.prisma.localPartner.findFirst({
      where: { id: partnerId, isActive: true, club: { isActive: true } },
      select: { id: true, clubId: true, name: true, offer: true, club: { select: { name: true } } },
    });
    if (!partner) throw new NotFoundException('Partenaire introuvable');
    if (!(await this.content.lastPlayedByClub(userId, now)).has(partner.clubId)) {
      throw new ForbiddenException(
        `Jouez une partie à ${partner.club.name} pour activer cet avantage.`,
      );
    }
    const token = randomBytes(18).toString('base64url');
    const expiresAt = new Date(now.getTime() + LOCAL_PARTNER_USE_TTL_MINUTES * 60_000);
    await this.prisma.localPartnerUse.create({
      data: { partnerId, userId, clubId: partner.clubId, tokenHash: sha256(token), expiresAt },
    });
    return {
      token,
      expiresAt,
      url: `${this.portalUrl}/partenaire/valider?t=${token}`,
      partner: { id: partner.id, name: partner.name, offer: partner.offer },
    };
  }

  async useStatus(userId: string, token: string, now = new Date()) {
    const use = await this.prisma.localPartnerUse.findUnique({
      where: { tokenHash: sha256(token) },
      select: { userId: true, usedAt: true, expiresAt: true },
    });
    if (!use || use.userId !== userId) throw new NotFoundException();
    return {
      status: use.usedAt ? 'USED' : use.expiresAt <= now ? 'EXPIRED' : 'PENDING',
      usedAt: use.usedAt,
    };
  }

  // ── Partenaire (lien personnel, sans compte) ──
  private async partnerByToken(portalToken: string | undefined) {
    if (!portalToken) throw new UnauthorizedException('Lien partenaire manquant');
    const p = await this.prisma.localPartner.findUnique({
      where: { portalToken },
      select: {
        id: true,
        name: true,
        offer: true,
        isActive: true,
        club: { select: { name: true } },
      },
    });
    if (!p) throw new UnauthorizedException('Lien partenaire invalide ou remplacé');
    return p;
  }

  async portal(portalToken: string | undefined, now = new Date()) {
    const p = await this.partnerByToken(portalToken);
    const [stats, recent] = await Promise.all([
      this.stats([p.id], now),
      this.prisma.localPartnerUse.findMany({
        where: { partnerId: p.id, usedAt: { not: null } },
        orderBy: { usedAt: 'desc' },
        take: 50,
        select: { usedAt: true, user: { select: { firstName: true, lastName: true } } },
      }),
    ]);
    return {
      partner: { name: p.name, offer: p.offer, club: p.club.name, isActive: p.isActive },
      stats: stats.get(p.id)!,
      recent: recent.map((u) => ({ usedAt: u.usedAt!, player: shortName(u.user) })),
    };
  }

  private async findUse(partnerId: string, token: string) {
    const use = await this.prisma.localPartnerUse.findUnique({
      where: { tokenHash: sha256(token) },
      select: {
        id: true,
        partnerId: true,
        usedAt: true,
        expiresAt: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });
    if (!use) throw new NotFoundException('QR code inconnu');
    if (use.partnerId !== partnerId)
      throw new ForbiddenException('Ce QR code concerne un autre partenaire.');
    return use;
  }

  async previewUse(portalToken: string | undefined, token: string, now = new Date()) {
    const p = await this.partnerByToken(portalToken);
    const use = await this.findUse(p.id, token);
    return {
      status: use.usedAt ? 'USED' : use.expiresAt <= now ? 'EXPIRED' : 'VALID',
      usedAt: use.usedAt,
      player: shortName(use.user),
      partner: { name: p.name, offer: p.offer },
    };
  }

  async validateUse(portalToken: string | undefined, token: string, now = new Date()) {
    const p = await this.partnerByToken(portalToken);
    if (!p.isActive) throw new ForbiddenException('Ce partenariat est suspendu.');
    const use = await this.findUse(p.id, token);
    // Usage unique, même si le QR code est scanné deux fois en même temps
    const done = await this.prisma.localPartnerUse.updateMany({
      where: { id: use.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (done.count === 0) {
      throw new GoneException(
        use.usedAt
          ? 'Avantage déjà utilisé avec ce QR code.'
          : 'QR code expiré : le joueur doit en afficher un nouveau.',
      );
    }
    return {
      status: 'USED' as const,
      usedAt: now,
      player: shortName(use.user),
      partner: { name: p.name, offer: p.offer },
    };
  }

  // ── Statistiques (club, GPR) ──
  async stats(partnerIds: string[], now = new Date()): Promise<Map<string, UseStats>> {
    const thisMonth = parisMonthStart(now);
    const lastMonth = parisMonthStart(now, -1);
    const rows = await this.prisma.$queryRaw<
      { partnerId: string; total: bigint; thisMonth: bigint; lastMonth: bigint }[]
    >`
      SELECT "partnerId",
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE "usedAt" >= ${thisMonth}) AS "thisMonth",
        COUNT(*) FILTER (WHERE "usedAt" >= ${lastMonth} AND "usedAt" < ${thisMonth}) AS "lastMonth"
      FROM "LocalPartnerUse" WHERE "usedAt" IS NOT NULL AND "partnerId"::text = ANY(${partnerIds})
      GROUP BY "partnerId"`;
    const out = new Map<string, UseStats>(
      partnerIds.map((id) => [id, { thisMonth: 0, lastMonth: 0, total: 0 }]),
    );
    for (const r of rows)
      out.set(r.partnerId, {
        total: Number(r.total),
        thisMonth: Number(r.thisMonth),
        lastMonth: Number(r.lastMonth),
      });
    return out;
  }

  /** Liste des partenaires du club pour le back-office : avec suivi, email et lien personnel. */
  async adminList(clubId: string) {
    const [partners, extra] = await Promise.all([
      this.content.listPartners(clubId),
      this.prisma.localPartner.findMany({
        where: { clubId },
        select: { id: true, email: true, portalToken: true },
      }),
    ]);
    const stats = await this.stats(partners.map((p) => p.id));
    return partners.map((p) => {
      const e = extra.find((x) => x.id === p.id)!;
      return {
        ...p,
        email: e.email,
        portalUrl: this.portalLink(e.portalToken),
        stats: stats.get(p.id)!,
      };
    });
  }

  async regeneratePortal(clubId: string, id: string, actor: AuthUser) {
    const p = await this.prisma.localPartner.findFirst({ where: { id, clubId } });
    if (!p) throw new NotFoundException('Partenaire introuvable');
    const portalToken = newPortalToken();
    await this.prisma.localPartner.update({ where: { id }, data: { portalToken } });
    await this.audit.log({
      actor: { id: actor.id, role: actor.role },
      action: 'local-partner.portal-link.regenerate',
      entityType: 'LocalPartner',
      entityId: id,
      clubId,
    });
    return { portalUrl: this.portalLink(portalToken) };
  }

  /** Vue GPR : tous les partenaires locaux, tous clubs. */
  async overview(now = new Date()) {
    const partners = await this.prisma.localPartner.findMany({
      orderBy: [{ club: { name: 'asc' } }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        offer: true,
        isActive: true,
        club: { select: { id: true, name: true } },
      },
    });
    const stats = await this.stats(
      partners.map((p) => p.id),
      now,
    );
    return partners.map((p) => ({ ...p, stats: stats.get(p.id)! }));
  }

  /** 1er du mois : récapitulatif du mois écoulé envoyé aux partenaires qui ont un email. */
  async monthlyReports(now = new Date()): Promise<number> {
    const from = parisMonthStart(now, -1);
    const to = parisMonthStart(now);
    const partners = await this.prisma.localPartner.findMany({
      where: { isActive: true, email: { not: null }, club: { isActive: true } },
      select: {
        id: true,
        name: true,
        offer: true,
        email: true,
        portalToken: true,
        club: { select: { name: true } },
      },
    });
    let sent = 0;
    for (const p of partners) {
      const count = await this.prisma.localPartnerUse.count({
        where: { partnerId: p.id, usedAt: { gte: from, lt: to } },
      });
      const text = [
        `Bonjour,`,
        ``,
        `Voici le récapitulatif de ${monthLabel(from)} pour votre partenariat avec ${p.club.name} (programme de fidélité GPR) :`,
        ``,
        `Avantage « ${p.offer} » utilisé ${count} fois.`,
        ``,
        `Détail et suivi en temps réel sur votre page partenaire : ${this.portalLink(p.portalToken)}`,
        ``,
        `Merci pour votre partenariat !`,
        `L'équipe GPR – Groupement Padel Référence`,
      ].join('\n');
      try {
        await this.mail.sendAlert(
          [p.email!],
          `${p.name} : ${count} utilisation(s) en ${monthLabel(from)}`,
          text,
        );
        sent++;
      } catch (e) {
        this.logger.error(`Récapitulatif non envoyé à ${p.name} : ${(e as Error).message}`);
      }
    }
    return sent;
  }
}
