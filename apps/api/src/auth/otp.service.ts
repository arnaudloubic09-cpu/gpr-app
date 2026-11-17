import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role, User } from '@prisma/client';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { OtpAudience } from '@gpr/core';
import type { Env } from '../config/env';
import { MailService } from '../common/mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

const ADMIN_ROLES: Role[] = [Role.CLUB_ADMIN, Role.SUPER_ADMIN];

/**
 * Connexion par code à usage unique envoyé par email.
 * - code à 6 chiffres, haché (HMAC + pepper), jamais stocké en clair ;
 * - durée de vie limitée, nombre d'essais limité, limitation des demandes par email ;
 * - réponses identiques que le compte existe ou non (pas d'énumération).
 * Comptes séparés : l'app mobile n'accepte que des joueurs, le back-office que des admins.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private cfg<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key, { infer: true });
  }

  hash(email: string, audience: OtpAudience, code: string): string {
    return createHmac('sha256', this.cfg('OTP_PEPPER'))
      .update(`${email}|${audience}|${code}`)
      .digest('hex');
  }

  /** Le compte peut-il se connecter sur cette audience ? (null = compte à créer côté mobile) */
  private isEligible(
    user: Pick<User, 'role' | 'anonymizedAt'> | null,
    audience: OtpAudience,
  ): boolean {
    if (audience === OtpAudience.ADMIN)
      return !!user && !user.anonymizedAt && ADMIN_ROLES.includes(user.role);
    if (!user) return true; // inscription d'un nouveau joueur
    return !user.anonymizedAt && user.role === Role.PLAYER;
  }

  async request(email: string, audience: OtpAudience): Promise<void> {
    const windowStart = new Date(Date.now() - this.cfg('OTP_REQUEST_WINDOW_MINUTES') * 60_000);
    const recent = await this.prisma.otpCode.count({
      where: { email, createdAt: { gte: windowStart } },
    });
    if (recent >= this.cfg('OTP_MAX_REQUESTS_PER_WINDOW')) {
      throw new HttpException(
        'Trop de demandes, réessayez dans quelques minutes',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!this.isEligible(user, audience)) {
      // Réponse identique : on enregistre une demande factice pour la limitation de débit, sans envoi.
      await this.prisma.otpCode.create({
        data: {
          email,
          audience,
          codeHash: 'ineligible',
          expiresAt: new Date(),
          consumedAt: new Date(),
        },
      });
      return;
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const ttl = this.cfg('OTP_TTL_MINUTES');
    await this.prisma.$transaction([
      // Un seul code actif à la fois : les précédents sont invalidés.
      this.prisma.otpCode.updateMany({
        where: { email, audience, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prisma.otpCode.create({
        data: {
          email,
          audience,
          codeHash: this.hash(email, audience, code),
          expiresAt: new Date(Date.now() + ttl * 60_000),
        },
      }),
    ]);

    try {
      await this.mail.sendOtp(email, code, ttl);
    } catch (err) {
      this.logger.error(`Échec d'envoi du code OTP : ${(err as Error).message}`);
      throw new HttpException(
        "Impossible d'envoyer l'email, réessayez",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /** Vérifie le code et renvoie l'utilisateur (créé s'il s'agit d'un nouveau joueur). */
  async verify(email: string, code: string, audience: OtpAudience): Promise<User> {
    const invalid = new UnauthorizedException('Code invalide ou expiré');
    const otp = await this.prisma.otpCode.findFirst({
      where: { email, audience, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) throw invalid;

    // Incrément atomique des essais, refus au-delà du maximum.
    const counted = await this.prisma.otpCode.updateMany({
      where: { id: otp.id, consumedAt: null, attempts: { lt: this.cfg('OTP_MAX_ATTEMPTS') } },
      data: { attempts: { increment: 1 } },
    });
    if (counted.count === 0) throw invalid;

    const expected = Buffer.from(otp.codeHash, 'hex');
    const given = Buffer.from(this.hash(email, audience, code), 'hex');
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      if (otp.attempts + 1 >= this.cfg('OTP_MAX_ATTEMPTS')) {
        await this.prisma.otpCode.update({
          where: { id: otp.id },
          data: { consumedAt: new Date() },
        });
      }
      throw invalid;
    }

    // Consommation atomique : un code ne sert qu'une fois, même en cas de requêtes simultanées.
    const consumed = await this.prisma.otpCode.updateMany({
      where: { id: otp.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count === 0) throw invalid;

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (!this.isEligible(existing, audience)) throw invalid;

    if (existing) {
      return this.prisma.user.update({
        where: { id: existing.id },
        data: { lastLoginAt: new Date() },
      });
    }
    return this.prisma.user.create({ data: { email, role: Role.PLAYER, lastLoginAt: new Date() } });
  }
}
