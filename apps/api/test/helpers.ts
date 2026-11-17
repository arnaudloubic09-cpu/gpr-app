import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, Role } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { MailService } from '../src/common/mail/mail.service';

/** Remplace l'envoi SMTP : capture les codes OTP envoyés. */
export class CapturingMailService extends MailService {
  readonly sent: { to: string; code: string }[] = [];
  async sendOtp(to: string, code: string): Promise<void> {
    this.sent.push({ to, code });
  }
  lastCodeFor(email: string): string | undefined {
    return [...this.sent].reverse().find((m) => m.to === email)?.code;
  }
}

export async function createTestApp() {
  const mail = new CapturingMailService();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue(mail)
    .compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return { app, mail };
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
