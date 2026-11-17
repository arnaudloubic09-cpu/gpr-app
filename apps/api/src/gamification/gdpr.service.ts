import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConsentType } from '@prisma/client';
import { MailService } from '../common/mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

export const DELETION_DELAY_DAYS = 30;

/** Droits RGPD du joueur : consentements, export, suppression avec délai de rétractation. */
@Injectable()
export class GdprService {
  private readonly logger = new Logger(GdprService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /** Dernier choix connu pour chaque type de consentement. */
  async consents(userId: string) {
    const rows = await this.prisma.consent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      distinct: ['type'],
    });
    return Object.values(ConsentType).map((type) => {
      const r = rows.find((x) => x.type === type);
      return { type, granted: r?.granted ?? false, updatedAt: r?.createdAt ?? null };
    });
  }

  /** Historique conservé : chaque changement ajoute une ligne (preuve du consentement). */
  async setConsents(userId: string, changes: { type: ConsentType; granted: boolean }[]) {
    const current = await this.consents(userId);
    const real = changes.filter(
      (c) =>
        current.find((x) => x.type === c.type)?.granted !== c.granted ||
        !current.find((x) => x.type === c.type)?.updatedAt,
    );
    if (real.length)
      await this.prisma.consent.createMany({ data: real.map((c) => ({ userId, ...c })) });
    return this.consents(userId);
  }

  /** Toutes les données personnelles du joueur (portabilité). */
  async export(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        createdAt: true,
        lastLoginAt: true,
        deletionScheduledFor: true,
        favoriteClub: { select: { name: true } },
        consents: {
          orderBy: { createdAt: 'asc' },
          select: { type: true, granted: true, createdAt: true },
        },
        externalLinks: { select: { provider: true, externalPlayerId: true, linkedAt: true } },
        ledger: {
          orderBy: { createdAt: 'asc' },
          select: {
            type: true,
            amount: true,
            reason: true,
            earnedAt: true,
            availableAt: true,
            expiresAt: true,
            club: { select: { name: true } },
          },
        },
        coupons: {
          orderBy: { createdAt: 'asc' },
          select: {
            code: true,
            status: true,
            createdAt: true,
            expiresAt: true,
            usedAt: true,
            reward: { select: { title: true } },
            club: { select: { name: true } },
          },
        },
        badges: { select: { awardedAt: true, badge: { select: { name: true } } } },
        progress: {
          select: {
            periodKey: true,
            progress: true,
            completedAt: true,
            challenge: { select: { name: true } },
          },
        },
        notifications: {
          orderBy: { createdAt: 'asc' },
          select: { type: true, title: true, body: true, createdAt: true, readAt: true },
        },
      },
    });
    if (!user) throw new NotFoundException();
    return { exportedAt: new Date().toISOString(), service: 'Programme de fidélité GPR', ...user };
  }

  async sendExportByEmail(userId: string) {
    const data = await this.export(userId);
    await this.mail.sendAttachment(
      data.email,
      'Vos données GPR',
      'Vous trouverez en pièce jointe l’ensemble des données personnelles associées à votre compte GPR (format JSON).',
      { filename: 'mes-donnees-gpr.json', content: JSON.stringify(data, null, 2) },
    );
  }

  async requestDeletion(userId: string, now = new Date()) {
    const scheduledFor = new Date(now.getTime() + DELETION_DELAY_DAYS * 86_400_000);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { deletionRequestedAt: now, deletionScheduledFor: scheduledFor },
    });
    await this.mail
      .sendAlert(
        [user.email],
        'Suppression de votre compte programmée',
        `Votre compte GPR sera supprimé le ${scheduledFor.toLocaleDateString('fr-FR')}.\n\n` +
          'Jusqu’à cette date, vous pouvez annuler la suppression depuis l’application (Profil → Confidentialité). ' +
          'Après cette date, vos données personnelles seront effacées et vos points GPR restants seront perdus.',
      )
      .catch(() => undefined);
    return { deletionScheduledFor: scheduledFor };
  }

  async cancelDeletion(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { deletionRequestedAt: null, deletionScheduledFor: null },
    });
  }

  /**
   * Anonymisation des comptes arrivés au terme du délai. Le ledger (immuable) est conservé,
   * rattaché à un compte qui ne contient plus aucune donnée personnelle.
   */
  async runDueDeletions(now = new Date()) {
    const due = await this.prisma.user.findMany({
      where: { deletionScheduledFor: { lte: now }, anonymizedAt: null },
      select: { id: true },
    });
    for (const { id } of due) {
      await this.prisma.$transaction([
        this.prisma.coupon.updateMany({
          where: { userId: id, status: 'ACTIVE' },
          data: { status: 'CANCELLED', closedAt: now },
        }),
        this.prisma.playerExternalLink.deleteMany({ where: { userId: id } }),
        this.prisma.pushToken.deleteMany({ where: { userId: id } }),
        this.prisma.notification.deleteMany({ where: { userId: id } }),
        this.prisma.refreshToken.deleteMany({ where: { userId: id } }),
        this.prisma.user.update({
          where: { id },
          data: {
            email: `supprime-${id}@anonymise.invalid`,
            firstName: null,
            lastName: null,
            phone: null,
            favoriteClubId: null,
            memberCode: null,
            anonymizedAt: now,
          },
        }),
      ]);
    }
    if (due.length)
      this.logger.log(`${due.length} compte(s) anonymisé(s) au terme du délai de rétractation`);
    return due.length;
  }
}
