import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, Role } from '@prisma/client';
import { DEFAULT_GPR_RULES } from '@gpr/core';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { MailService } from '../src/common/mail/mail.service';
import { ConnectorRegistry } from '../src/connectors/connector-registry';
import type { Booking, BookingConnector, Participant } from '@gpr/connectors';

/** Connecteur entièrement piloté par le test. */
export class FakeConnector implements BookingConnector {
  readonly provider = 'MOCK' as const;
  bookings: Booking[] = [];
  participants: Record<string, Participant[]> = {};
  failWith: string | null = null;
  delayMs = 0;

  async listEndedBookings(): Promise<Booking[]> {
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.failWith) throw new Error(this.failWith);
    return this.bookings.map((b) => ({ ...b }));
  }
  async getBookingParticipants(_c: unknown, id: string): Promise<Participant[]> {
    return this.participants[id] ?? [];
  }
  async matchPlayer() {
    return null;
  }
  setStatus(externalId: string, status: Booking['status']) {
    this.bookings.find((b) => b.externalId === externalId)!.status = status;
  }
}

/** Remplace l'envoi SMTP : capture les codes OTP envoyés. */
export class CapturingMailService extends MailService {
  readonly sent: { to: string; code: string }[] = [];
  readonly alerts: { to: string[]; subject: string; text: string }[] = [];
  async sendOtp(to: string, code: string): Promise<void> {
    this.sent.push({ to, code });
  }
  async sendAlert(to: string[], subject: string, text: string): Promise<void> {
    this.alerts.push({ to, subject, text });
  }
  readonly attachments: { to: string; subject: string; filename: string; content: string }[] = [];
  async sendAttachment(
    to: string,
    subject: string,
    _text: string,
    a: { filename: string; content: string },
  ): Promise<void> {
    this.attachments.push({ to, subject, ...a });
  }
  lastCodeFor(email: string): string | undefined {
    return [...this.sent].reverse().find((m) => m.to === email)?.code;
  }
}

/**
 * Règles GPR par défaut garanties dans la base de test : chaque suite est autonome,
 * y compris sur une base neuve (CI). N'écrase pas une version existante.
 */
export async function ensureDefaultRules() {
  const prisma = new PrismaClient();
  try {
    const r = DEFAULT_GPR_RULES;
    await prisma.ruleSet.upsert({
      where: { version: 1 },
      update: {},
      create: {
        version: 1,
        pointsPerSlot: r.pointsPerSlot,
        slotMinutes: r.slotMinutes,
        dailyCapPerPlayer: null,
        dailyMaxMinutes: r.dailyMaxMinutes,
        pendingDelayMinutes: r.pendingDelayMinutes,
        expirationMonths: r.expirationMonths,
        couponValidityDays: r.couponValidityDays,
        clubAdjustmentMax: r.clubAdjustmentMax,
        offPeakMultiplier: r.offPeakMultiplier,
        offPeakWindows: r.offPeakWindows as never,
        levels: r.levels as never,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

export async function createTestApp(connector?: BookingConnector) {
  await ensureDefaultRules();
  const mail = new CapturingMailService();
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue(mail);
  if (connector)
    builder = builder.overrideProvider(ConnectorRegistry).useValue({ get: () => connector });
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return { app, mail, moduleRef };
}

export const uniqueEmail = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}@test.example`;

export async function createClub(prisma: PrismaClient, name = 'Club test') {
  return prisma.club.create({ data: { name, slug: `club-${randomUUID()}`, city: 'Testville' } });
}

export async function createUser(prisma: PrismaClient, role: Role, clubId: string | null = null) {
  return prisma.user.create({ data: { email: uniqueEmail(role.toLowerCase()), role, clubId } });
}

/** Parcours de connexion complet par OTP ; renvoie les jetons. */
export async function login(
  app: INestApplication,
  mail: CapturingMailService,
  email: string,
  audience: 'MOBILE' | 'ADMIN',
) {
  await request(app.getHttpServer())
    .post('/auth/otp/request')
    .send({ email, audience })
    .expect(202);
  const code = mail.lastCodeFor(email);
  if (!code) throw new Error(`Aucun code envoyé à ${email}`);
  const res = await request(app.getHttpServer())
    .post('/auth/otp/verify')
    .send({ email, code, audience })
    .expect(200);
  return res.body as { accessToken: string; refreshToken: string };
}
