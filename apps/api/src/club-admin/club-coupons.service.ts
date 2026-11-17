import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { AnalyticsService } from '../common/analytics/analytics.service';
import { AuditService } from '../common/audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { COUPON_INCLUDE, toCouponView } from '../rewards/rewards.service';

export type CouponState = 'VALID' | 'USED' | 'EXPIRED' | 'CANCELLED';

/** Accepte « gpr-7k4m-q2xd », « GPR7K4MQ2XD », « 7K4M Q2XD »… */
export function normalizeCouponCode(raw: string): string | null {
  let n = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (n.length === 8) n = `GPR${n}`;
  if (!/^GPR[A-Z0-9]{8}$/.test(n)) return null;
  return `GPR-${n.slice(3, 7)}-${n.slice(7)}`;
}

/** Validation des coupons à l'accueil du club : usage unique garanti par une mise à jour conditionnelle. */
@Injectable()
export class ClubCouponsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly analytics: AnalyticsService,
  ) {}

  private async find(clubId: string, rawCode: string) {
    const code = normalizeCouponCode(rawCode);
    const coupon = code
      ? await this.prisma.coupon.findUnique({
          where: { code },
          include: { ...COUPON_INCLUDE, user: { select: { firstName: true, lastName: true } } },
        })
      : null;
    if (!coupon)
      throw new NotFoundException({
        code: 'UNKNOWN',
        message: 'Code inconnu. Vérifiez la saisie.',
      });
    if (coupon.clubId !== clubId) {
      throw new NotFoundException({
        code: 'OTHER_CLUB',
        message: `Ce coupon a été émis pour le club « ${coupon.club.name} » : il ne peut être utilisé que là-bas.`,
      });
    }
    return coupon;
  }

  private stateOf(c: { status: string; expiresAt: Date }, now = new Date()): CouponState {
    if (c.status === 'USED') return 'USED';
    if (c.status === 'CANCELLED') return 'CANCELLED';
    if (c.status === 'EXPIRED' || c.expiresAt <= now) return 'EXPIRED';
    return 'VALID';
  }

  private present(c: Awaited<ReturnType<ClubCouponsService['find']>>) {
    return {
      state: this.stateOf(c),
      coupon: toCouponView(c),
      // Minimisation : prénom + initiale, suffisant pour vérifier au comptoir.
      player: { firstName: c.user.firstName, lastInitial: c.user.lastName?.charAt(0) ?? null },
    };
  }

  async lookup(clubId: string, code: string) {
    return this.present(await this.find(clubId, code));
  }

  async validate(clubId: string, rawCode: string, actor: AuthUser) {
    const coupon = await this.find(clubId, rawCode);
    const now = new Date();
    const res = await this.prisma.coupon.updateMany({
      where: { id: coupon.id, clubId, status: 'ACTIVE', expiresAt: { gt: now } },
      data: { status: 'USED', usedAt: now, validatedById: actor.id },
    });
    if (res.count === 0) {
      const fresh = await this.find(clubId, rawCode);
      const state = this.stateOf(fresh);
      const messages: Record<CouponState, string> = {
        USED: `Coupon déjà utilisé le ${fresh.usedAt?.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}.`,
        EXPIRED: 'Coupon expiré : les points ont été (ou seront) rendus au joueur.',
        CANCELLED: 'Coupon annulé par le joueur.',
        VALID: 'Validation impossible, réessayez.',
      };
      throw new ConflictException({ code: state, message: messages[state] });
    }
    await this.audit.log({
      actor: { id: actor.id, role: actor.role },
      action: 'coupon.validate',
      entityType: 'Coupon',
      entityId: coupon.id,
      clubId,
      after: { code: coupon.code, reward: coupon.reward.title },
    });
    await this.analytics.track('coupon.used', {
      userId: coupon.userId,
      clubId,
      payload: { couponId: coupon.id, rewardId: coupon.rewardId, cost: -coupon.ledgerEntry.amount },
    });
    return this.present(await this.find(clubId, rawCode));
  }
}
