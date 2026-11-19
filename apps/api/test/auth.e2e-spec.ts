import { INestApplication } from '@nestjs/common';
import { PrismaClient, Role } from '@prisma/client';
import request from 'supertest';
import {
  CapturingMailService,
  createClub,
  createTestApp,
  createUser,
  login,
  uniqueEmail,
} from './helpers';

describe('Authentification OTP (intégration)', () => {
  let app: INestApplication;
  let mail: CapturingMailService;
  const prisma = new PrismaClient();
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, mail } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('inscrit un nouveau joueur via l’app mobile et renvoie son profil', async () => {
    const email = uniqueEmail('nouveau');
    const { accessToken } = await login(app, mail, email, 'MOBILE');
    const me = await http().get('/me').set('Authorization', `Bearer ${accessToken}`).expect(200);
    expect(me.body).toMatchObject({ email, role: 'PLAYER', clubId: null });
  });

  it('normalise l’email (casse, espaces)', async () => {
    const email = uniqueEmail('casse');
    await http()
      .post('/auth/otp/request')
      .send({ email: `  ${email.toUpperCase()} `, audience: 'MOBILE' })
      .expect(202);
    expect(mail.lastCodeFor(email)).toBeDefined();
  });

  it('ne stocke jamais le code en clair', async () => {
    const email = uniqueEmail('hash');
    await http().post('/auth/otp/request').send({ email, audience: 'MOBILE' }).expect(202);
    const code = mail.lastCodeFor(email)!;
    const row = await prisma.otpCode.findFirstOrThrow({ where: { email, consumedAt: null } });
    expect(row.codeHash).not.toContain(code);
  });

  it('refuse un code erroné puis bloque après 5 essais, même avec le bon code', async () => {
    const email = uniqueEmail('essais');
    await http().post('/auth/otp/request').send({ email, audience: 'MOBILE' }).expect(202);
    const code = mail.lastCodeFor(email)!;
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      await http()
        .post('/auth/otp/verify')
        .send({ email, code: wrong, audience: 'MOBILE' })
        .expect(401);
    }
    await http().post('/auth/otp/verify').send({ email, code, audience: 'MOBILE' }).expect(401);
  });

  it('un code ne sert qu’une seule fois', async () => {
    const email = uniqueEmail('unique');
    await http().post('/auth/otp/request').send({ email, audience: 'MOBILE' }).expect(202);
    const code = mail.lastCodeFor(email)!;
    await http().post('/auth/otp/verify').send({ email, code, audience: 'MOBILE' }).expect(200);
    await http().post('/auth/otp/verify').send({ email, code, audience: 'MOBILE' }).expect(401);
  });

  it('refuse un code expiré', async () => {
    const email = uniqueEmail('expire');
    await http().post('/auth/otp/request').send({ email, audience: 'MOBILE' }).expect(202);
    const code = mail.lastCodeFor(email)!;
    await prisma.otpCode.updateMany({
      where: { email },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await http().post('/auth/otp/verify').send({ email, code, audience: 'MOBILE' }).expect(401);
  });

  it('seul le dernier code demandé est valable', async () => {
    const email = uniqueEmail('dernier');
    await http().post('/auth/otp/request').send({ email, audience: 'MOBILE' }).expect(202);
    const first = mail.lastCodeFor(email)!;
    await http().post('/auth/otp/request').send({ email, audience: 'MOBILE' }).expect(202);
    const second = mail.lastCodeFor(email)!;
    if (first !== second) {
      await http()
        .post('/auth/otp/verify')
        .send({ email, code: first, audience: 'MOBILE' })
        .expect(401);
    }
    await http()
      .post('/auth/otp/verify')
      .send({ email, code: second, audience: 'MOBILE' })
      .expect(200);
  });

  it('limite le nombre de demandes de code par email', async () => {
    const email = uniqueEmail('spam');
    for (let i = 0; i < 3; i++) {
      await http().post('/auth/otp/request').send({ email, audience: 'MOBILE' }).expect(202);
    }
    await http().post('/auth/otp/request').send({ email, audience: 'MOBILE' }).expect(429);
  });

  describe('comptes séparés joueur / admin', () => {
    it('le back-office n’envoie aucun code à un joueur ni à un inconnu (réponse identique)', async () => {
      const player = await createUser(prisma, Role.PLAYER);
      const unknown = uniqueEmail('inconnu');
      for (const email of [player.email, unknown]) {
        const res = await http()
          .post('/auth/otp/request')
          .send({ email, audience: 'ADMIN' })
          .expect(202);
        expect(res.body.message).toMatch(/Si ce compte/);
        expect(mail.lastCodeFor(email)).toBeUndefined();
      }
      expect(await prisma.user.count({ where: { email: unknown } })).toBe(0);
    });

    it('l’app mobile n’accepte pas un compte admin', async () => {
      const club = await createClub(prisma);
      const admin = await createUser(prisma, Role.CLUB_ADMIN, club.id);
      await http()
        .post('/auth/otp/request')
        .send({ email: admin.email, audience: 'MOBILE' })
        .expect(202);
      expect(mail.lastCodeFor(admin.email)).toBeUndefined();
    });

    it('un admin club se connecte au back-office', async () => {
      const club = await createClub(prisma);
      const admin = await createUser(prisma, Role.CLUB_ADMIN, club.id);
      const { accessToken } = await login(app, mail, admin.email, 'ADMIN');
      const me = await http().get('/me').set('Authorization', `Bearer ${accessToken}`).expect(200);
      expect(me.body).toMatchObject({ role: 'CLUB_ADMIN', clubId: club.id });
    });
  });

  describe('refresh token', () => {
    it('effectue une rotation et révoque toute la famille si un ancien jeton est rejoué', async () => {
      const email = uniqueEmail('refresh');
      const first = await login(app, mail, email, 'MOBILE');
      const old = new Date('2026-01-01T00:00:00Z');
      await prisma.user.update({ where: { email }, data: { lastLoginAt: old } });

      const rotated = await http()
        .post('/auth/refresh')
        .send({ refreshToken: first.refreshToken })
        .expect(200);
      expect(rotated.body.refreshToken).not.toEqual(first.refreshToken);
      // La reprise de session (ouverture de l'app) met à jour la dernière activité
      const u = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(u.lastLoginAt!.getTime()).toBeGreaterThan(old.getTime());

      // Rejeu de l'ancien jeton : refusé, et le nouveau est révoqué aussi.
      await http().post('/auth/refresh').send({ refreshToken: first.refreshToken }).expect(401);
      await http()
        .post('/auth/refresh')
        .send({ refreshToken: rotated.body.refreshToken })
        .expect(401);
    });

    it('la déconnexion révoque le jeton', async () => {
      const { refreshToken } = await login(app, mail, uniqueEmail('logout'), 'MOBILE');
      await http().post('/auth/logout').send({ refreshToken }).expect(204);
      await http().post('/auth/refresh').send({ refreshToken }).expect(401);
    });
  });

  it('refuse les routes protégées sans jeton ou avec un jeton invalide', async () => {
    await http().get('/me').expect(401);
    await http().get('/me').set('Authorization', 'Bearer abc.def.ghi').expect(401);
  });

  it('un compte anonymisé (RGPD) perd immédiatement l’accès', async () => {
    const email = uniqueEmail('rgpd');
    const { accessToken } = await login(app, mail, email, 'MOBILE');
    await prisma.user.update({ where: { email }, data: { anonymizedAt: new Date() } });
    await http().get('/me').set('Authorization', `Bearer ${accessToken}`).expect(401);
  });
});
