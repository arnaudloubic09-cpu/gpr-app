import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { Club, PrismaClient, Role, User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { addMonths, DEFAULT_GPR_RULES } from '@gpr/core';
import { TokenService } from '../src/auth/token.service';
import { SyncService } from '../src/sync/sync.service';
import {
  CapturingMailService,
  createClub,
  createTestApp,
  createUser,
  FakeConnector,
} from './helpers';

describe('Back-office : admin club et super admin (intégration)', () => {
  const prisma = new PrismaClient();
  const fake = new FakeConnector();
  let app: INestApplication;
  let mail: CapturingMailService;
  let moduleRef: TestingModule;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, mail, moduleRef } = await createTestApp(fake));
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  /** Jeton émis directement (le parcours OTP est couvert par auth.e2e-spec). */
  const as = async (u: User) => ({
    Authorization: `Bearer ${(await moduleRef.get(TokenService).issue(u)).accessToken}`,
  });

  let club: Club;
  let otherClub: Club;
  let admin: User;
  let otherAdmin: User;
  let superAdmin: User;
  let player: User;

  async function credit(user: User, amount: number, clubId: string | null = club.id) {
    const earnedAt = new Date(Date.now() - 86_400_000);
    await prisma.ledgerEntry.create({
      data: {
        userId: user.id,
        type: 'EARN',
        amount,
        sourceType: 'BOOKING',
        sourceId: randomUUID(),
        clubId,
        idempotencyKey: `test:${randomUUID()}`,
        earnedAt,
        availableAt: earnedAt,
        expiresAt: addMonths(earnedAt, 12),
      },
    });
  }
  async function couponFor(user: User, c: Club = club, over: Record<string, unknown> = {}) {
    await credit(user, 200, c.id);
    const reward = await prisma.reward.create({
      data: { clubId: c.id, category: 'DRINK', kind: 'FREE_ITEM', title: 'Bière', costGpr: 80 },
    });
    const res = await http()
      .post(`/rewards/${reward.id}/redeem`)
      .set(await as(user))
      .send({ requestId: randomUUID() })
      .expect(201);
    if (Object.keys(over).length)
      await prisma.coupon.update({ where: { id: res.body.id }, data: over });
    return res.body as { id: string; code: string };
  }

  beforeEach(async () => {
    club = await createClub(prisma, 'Club Alpha');
    otherClub = await createClub(prisma, 'Club Beta');
    admin = await createUser(prisma, Role.CLUB_ADMIN, club.id);
    otherAdmin = await createUser(prisma, Role.CLUB_ADMIN, otherClub.id);
    superAdmin = await createUser(prisma, Role.SUPER_ADMIN);
    player = await prisma.user.create({
      data: { email: `${randomUUID()}@t.example`, firstName: 'Julien', lastName: 'Martin' },
    });
  });

  describe('validation des coupons au comptoir', () => {
    it('valide un coupon une seule fois, même avec des validations simultanées', async () => {
      const { code } = await couponFor(player);
      const look = await http()
        .get(`/clubs/${club.id}/coupons/${code}`)
        .set(await as(admin))
        .expect(200);
      expect(look.body).toMatchObject({
        state: 'VALID',
        player: { firstName: 'Julien', lastInitial: 'M' },
      });

      const h = await as(admin);
      const results = await Promise.all(
        [1, 2, 3].map(() => http().post(`/clubs/${club.id}/coupons/${code}/validate`).set(h)),
      );
      expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409]);
      expect(results.find((r) => r.status === 409)!.body.code).toBe('USED');

      const c = await prisma.coupon.findUniqueOrThrow({ where: { code } });
      expect(c).toMatchObject({ status: 'USED', validatedById: admin.id });
      expect(
        await prisma.auditLog.count({ where: { entityId: c.id, action: 'coupon.validate' } }),
      ).toBe(1);
    });

    it('accepte le code saisi sans tirets ni majuscules', async () => {
      const { code } = await couponFor(player);
      const typed = code.toLowerCase().replace(/-/g, '');
      await http()
        .post(`/clubs/${club.id}/coupons/${typed}/validate`)
        .set(await as(admin))
        .expect(200);
    });

    it('accepte un code scanné par une douchette réglée en QWERTY sur un poste AZERTY', async () => {
      const { code } = await couponFor(player);
      const digits: Record<string, string> = {
        '2': 'é',
        '3': '"',
        '4': "'",
        '5': '(',
        '6': '-',
        '7': 'è',
        '8': '_',
        '9': 'ç',
      };
      const swap: Record<string, string> = { A: 'Q', Q: 'A', Z: 'W', W: 'Z', M: '?', '-': ')' };
      const typed = [...code].map((c) => digits[c] ?? swap[c] ?? c).join('');
      expect(typed).toContain(')');
      const res = await http()
        .post(`/clubs/${club.id}/coupons/${encodeURIComponent(typed)}/validate`)
        .set(await as(admin))
        .expect(200);
      expect(res.body.coupon.code).toBe(code);
    });

    it('option « validation en un geste » enregistrée par club (admin uniquement)', async () => {
      const h = await as(admin);
      const res = await http()
        .patch(`/clubs/${club.id}/settings`)
        .set(h)
        .send({ counterAutoValidate: true })
        .expect(200);
      expect(res.body.counterAutoValidate).toBe(true);
      expect(
        (await http().get(`/clubs/${club.id}`).set(h).expect(200)).body.counterAutoValidate,
      ).toBe(true);
      await http().patch(`/clubs/${club.id}/settings`).set(h).send({}).expect(400);
      await http()
        .patch(`/clubs/${club.id}/settings`)
        .set(await as(otherAdmin))
        .send({ counterAutoValidate: true })
        .expect(403);
    });

    it('refuse un coupon émis pour un autre club, en indiquant lequel', async () => {
      const { code } = await couponFor(player, otherClub);
      const res = await http()
        .post(`/clubs/${club.id}/coupons/${code}/validate`)
        .set(await as(admin))
        .expect(404);
      expect(res.body).toMatchObject({ code: 'OTHER_CLUB' });
      expect(res.body.message).toContain('Club Beta');
    });

    it('refuse un coupon expiré ou annulé', async () => {
      const expired = await couponFor(player, club, { expiresAt: new Date(Date.now() - 1000) });
      expect(
        (
          await http()
            .get(`/clubs/${club.id}/coupons/${expired.code}`)
            .set(await as(admin))
        ).body.state,
      ).toBe('EXPIRED');
      expect(
        (
          await http()
            .post(`/clubs/${club.id}/coupons/${expired.code}/validate`)
            .set(await as(admin))
            .expect(409)
        ).body.code,
      ).toBe('EXPIRED');

      const cancelled = await couponFor(player);
      await http()
        .post(`/me/coupons/${cancelled.id}/cancel`)
        .set(await as(player))
        .expect(200);
      expect(
        (
          await http()
            .post(`/clubs/${club.id}/coupons/${cancelled.code}/validate`)
            .set(await as(admin))
            .expect(409)
        ).body.code,
      ).toBe('CANCELLED');
    });

    it('code inconnu → 404 ; joueur et admin d’un autre club → 403', async () => {
      await http()
        .get(`/clubs/${club.id}/coupons/GPR-AAAA-AAAA`)
        .set(await as(admin))
        .expect(404);
      const { code } = await couponFor(player);
      await http()
        .post(`/clubs/${club.id}/coupons/${code}/validate`)
        .set(await as(player))
        .expect(403);
      await http()
        .post(`/clubs/${club.id}/coupons/${code}/validate`)
        .set(await as(otherAdmin))
        .expect(403);
    });
  });

  describe('catalogue du club', () => {
    const beer = { category: 'DRINK', kind: 'FREE_ITEM', title: 'Bière offerte', costGpr: 80 };

    it('crée et modifie une récompense, avec journal d’audit', async () => {
      const h = await as(admin);
      const created = await http()
        .post(`/clubs/${club.id}/admin/rewards`)
        .set(h)
        .send({ ...beer, stock: 10 })
        .expect(201);
      const updated = await http()
        .patch(`/clubs/${club.id}/admin/rewards/${created.body.id}`)
        .set(h)
        .send({ ...beer, costGpr: 90, isActive: false })
        .expect(200);
      expect(updated.body).toMatchObject({ costGpr: 90, isActive: false, stock: null });
      expect(await prisma.auditLog.count({ where: { entityId: created.body.id } })).toBe(2);
      const list = await http().get(`/clubs/${club.id}/admin/rewards`).set(h).expect(200);
      expect(list.body).toHaveLength(1);
    });

    it('refuse une partie de padel, un cours gratuit, une réduction invalide', async () => {
      const h = await as(admin);
      await http()
        .post(`/clubs/${club.id}/admin/rewards`)
        .set(h)
        .send({ ...beer, category: 'BOOKING' })
        .expect(400);
      await http()
        .post(`/clubs/${club.id}/admin/rewards`)
        .set(h)
        .send({ ...beer, category: 'LESSON' })
        .expect(400);
      await http()
        .post(`/clubs/${club.id}/admin/rewards`)
        .set(h)
        .send({ ...beer, category: 'EQUIPMENT', kind: 'DISCOUNT_PERCENT', discountValue: 150 })
        .expect(400);
      await http()
        .post(`/clubs/${club.id}/admin/rewards`)
        .set(h)
        .send({ ...beer, category: 'LESSON', kind: 'DISCOUNT_PERCENT', discountValue: 20 })
        .expect(201);
    });

    it('un admin ne gère pas le catalogue d’un autre club', async () => {
      await http()
        .post(`/clubs/${otherClub.id}/admin/rewards`)
        .set(await as(admin))
        .send(beer)
        .expect(403);
      const r = await prisma.reward.create({ data: { clubId: otherClub.id, ...beer } as never });
      await http()
        .patch(`/clubs/${club.id}/admin/rewards/${r.id}`)
        .set(await as(admin))
        .send(beer)
        .expect(404);
    });
  });

  describe('joueurs et ajustements', () => {
    it('un admin club ne voit que les joueurs actifs dans son club, et leur historique dans son club', async () => {
      await credit(player, 100, club.id);
      await credit(player, 40, otherClub.id);
      const stranger = await createUser(prisma, Role.PLAYER);
      await credit(stranger, 10, otherClub.id);
      const h = await as(admin);

      const list = await http().get(`/clubs/${club.id}/players?search=julien`).set(h).expect(200);
      expect(list.body.map((p: { id: string }) => p.id)).toContain(player.id);
      await http().get(`/clubs/${club.id}/players/${stranger.id}`).set(h).expect(404);

      const detail = await http().get(`/clubs/${club.id}/players/${player.id}`).set(h).expect(200);
      expect(detail.body.balance.available).toBe(140); // solde global
      expect(detail.body.transactions.map((t: { amount: number }) => t.amount)).toEqual([100]); // historique du club
      expect(detail.body.phone).toBeUndefined();
    });

    it('ajustement motivé, plafonné pour un admin club, illimité pour le super admin', async () => {
      await credit(player, 50, club.id);
      const h = await as(admin);
      const ok = await http()
        .post(`/clubs/${club.id}/players/${player.id}/adjustments`)
        .set(h)
        .send({ amount: 100, reason: 'Geste commercial tournoi' })
        .expect(201);
      expect(ok.body.balance.available).toBe(150);

      await http()
        .post(`/clubs/${club.id}/players/${player.id}/adjustments`)
        .set(h)
        .send({ amount: 500, reason: 'Trop gros geste' })
        .expect(403);
      await http()
        .post(`/clubs/${club.id}/players/${player.id}/adjustments`)
        .set(h)
        .send({ amount: 10 })
        .expect(400);
      await http()
        .post(`/clubs/${club.id}/players/${player.id}/adjustments`)
        .set(h)
        .send({ amount: -190, reason: 'Retrait trop important' })
        .expect(422);

      const sa = await http()
        .post(`/admin/players/${player.id}/adjustments`)
        .set(await as(superAdmin))
        .send({ amount: 500, reason: 'Compensation panne' })
        .expect(201);
      expect(sa.body.balance.available).toBe(650);

      const adj = await prisma.ledgerEntry.findFirstOrThrow({
        where: { userId: player.id, type: 'ADJUST', amount: 100 },
      });
      expect(adj).toMatchObject({
        authorId: admin.id,
        clubId: club.id,
        reason: 'Geste commercial tournoi',
      });
      expect(
        await prisma.auditLog.count({
          where: { entityId: player.id, action: 'player.points.adjust' },
        }),
      ).toBe(2);
    });
  });

  describe('statistiques', () => {
    it('club : joueurs actifs, points distribués et dépensés, coupons', async () => {
      const { code } = await couponFor(player); // crédite 200 et dépense 80 dans le club
      await http()
        .post(`/clubs/${club.id}/coupons/${code}/validate`)
        .set(await as(admin))
        .expect(200);
      const res = await http()
        .get(`/clubs/${club.id}/stats?period=30d`)
        .set(await as(admin))
        .expect(200);
      expect(res.body).toMatchObject({
        periodDays: 30,
        activePlayers: 1,
        points: { distributed: 200, redeemed: 80 },
        coupons: { USED: 1, validated: 1 },
      });
      expect(res.body.topRewards[0]).toMatchObject({ title: 'Bière', count: 1 });
      expect(res.body.series.length).toBeGreaterThan(0);
      await http()
        .get(`/clubs/${club.id}/stats`)
        .set(await as(otherAdmin))
        .expect(403);
    });

    it('groupement : flux de points par club (réservé au super admin)', async () => {
      await credit(player, 300, club.id);
      const r = await prisma.reward.create({
        data: {
          clubId: otherClub.id,
          category: 'SNACK',
          kind: 'FREE_ITEM',
          title: 'Pizza',
          costGpr: 100,
        },
      });
      await http()
        .post(`/rewards/${r.id}/redeem`)
        .set(await as(player))
        .send({ requestId: randomUUID() })
        .expect(201);

      const res = await http()
        .get('/admin/stats?period=7d')
        .set(await as(superAdmin))
        .expect(200);
      const alpha = res.body.perClub.find((c: { club: { id: string } }) => c.club.id === club.id);
      const beta = res.body.perClub.find(
        (c: { club: { id: string } }) => c.club.id === otherClub.id,
      );
      expect(alpha).toMatchObject({ distributed: 300, redeemed: 0, net: 300 });
      expect(beta).toMatchObject({ distributed: 0, redeemed: 100, net: -100 });
      await http()
        .get('/admin/stats')
        .set(await as(admin))
        .expect(403);
    });
  });

  describe('super admin', () => {
    it('crée un club et configure son connecteur : identifiants chiffrés, jamais renvoyés ni journalisés', async () => {
      const h = await as(superAdmin);
      const created = await http()
        .post('/admin/clubs')
        .set(h)
        .send({ name: 'Padel Évasion Lyon', city: 'Lyon' })
        .expect(201);
      expect(created.body.slug).toMatch(/^padel-evasion-lyon/);
      const conn = await http()
        .put(`/admin/clubs/${created.body.id}/connector`)
        .set(h)
        .send({
          provider: 'PLAYTOMIC',
          externalClubId: 'tenant-42',
          credentials: { apiKey: 'super-secret-key' },
          syncIntervalMinutes: 15,
        })
        .expect(200);
      expect(conn.body).toEqual({
        provider: 'PLAYTOMIC',
        externalClubId: 'tenant-42',
        syncIntervalMinutes: 15,
        hasCredentials: true,
      });

      const stored = await prisma.clubConnectorConfig.findUniqueOrThrow({
        where: { clubId: created.body.id },
      });
      expect(stored.credentialsEncrypted).not.toContain('super-secret-key');
      const list = await http().get('/admin/clubs').set(h).expect(200);
      expect(JSON.stringify(list.body)).not.toContain('super-secret-key');
      const audits = await prisma.auditLog.findMany({ where: { clubId: created.body.id } });
      expect(JSON.stringify(audits)).not.toContain('super-secret-key');
      await http()
        .post('/admin/clubs')
        .set(await as(admin))
        .send({ name: 'X club', city: 'Y' })
        .expect(403);
    });

    it('les règles GPR évoluent par nouvelles versions ; le plafond journalier reste désactivé', async () => {
      const h = await as(superAdmin);
      const before = await http().get('/admin/rules').set(h).expect(200);
      const r = DEFAULT_GPR_RULES;
      const body = { ...r, dailyCapPerPlayer: null };
      const created = await http().post('/admin/rules').set(h).send(body).expect(201);
      expect(created.body.version).toBe(before.body.active.version + 1);
      expect((await http().get('/admin/rules').set(h)).body.active.version).toBe(
        created.body.version,
      );
      await http()
        .post('/admin/rules')
        .set(h)
        .send({ ...body, dailyCapPerPlayer: 60 })
        .expect(400);
      await http()
        .post('/admin/rules')
        .set(await as(admin))
        .send(body)
        .expect(403);
    });

    it('crée un admin club ; un compte désactivé perd immédiatement l’accès', async () => {
      const h = await as(superAdmin);
      const email = `${randomUUID()}@club.example`;
      const created = await http()
        .post('/admin/users')
        .set(h)
        .send({ email, firstName: 'Léa', lastName: 'Roux', role: 'CLUB_ADMIN', clubId: club.id })
        .expect(201);
      await http()
        .post('/admin/users')
        .set(h)
        .send({ email, firstName: 'L', lastName: 'R', role: 'CLUB_ADMIN', clubId: club.id })
        .expect(409);
      await http()
        .post('/admin/users')
        .set(h)
        .send({
          email: `${randomUUID()}@x.example`,
          firstName: 'L',
          lastName: 'R',
          role: 'CLUB_ADMIN',
          clubId: null,
        })
        .expect(400);

      const newAdmin = await prisma.user.findUniqueOrThrow({ where: { id: created.body.id } });
      const token = await as(newAdmin);
      await http().get(`/clubs/${club.id}/stats`).set(token).expect(200);
      await http().post(`/admin/users/${newAdmin.id}/disable`).set(h).expect(200);
      await http().get(`/clubs/${club.id}/stats`).set(token).expect(401);
      await http().post('/auth/otp/request').send({ email, audience: 'ADMIN' }).expect(202);
      expect(mail.lastCodeFor(email)).toBeUndefined();

      await http().post(`/admin/users/${superAdmin.id}/disable`).set(h).expect(400);
    });

    it('journal d’audit consultable et filtrable par club', async () => {
      await http()
        .patch(`/clubs/${club.id}/settings`)
        .set(await as(admin))
        .send({ offPeakBonusEnabled: true })
        .expect(200);
      const res = await http()
        .get(`/admin/audit?clubId=${club.id}`)
        .set(await as(superAdmin))
        .expect(200);
      expect(res.body.items[0]).toMatchObject({
        action: 'club.settings.update',
        actor: { id: admin.id },
      });
    });
  });

  describe('alerte de synchronisation', () => {
    it('envoie un seul email aux super admins après 3 échecs consécutifs, réarmé après un succès', async () => {
      const sync = moduleRef.get(SyncService);
      const name = `Club Alerte ${randomUUID().slice(0, 6)}`;
      const c = await prisma.club.create({
        data: { name, slug: `alerte-${randomUUID()}`, city: 'Test' },
      });
      await prisma.clubConnectorConfig.create({
        data: { clubId: c.id, provider: 'MOCK', externalClubId: 'x' },
      });
      const alerts = () => mail.alerts.filter((a) => a.subject.includes(name));
      fake.bookings = [];
      fake.failWith = 'API Playtomic indisponible';
      try {
        await sync.syncClub(c.id);
        await sync.syncClub(c.id);
        expect(alerts()).toHaveLength(0);
        await sync.syncClub(c.id); // 3e échec → alerte
        await sync.syncClub(c.id); // 4e échec → pas de doublon
        expect(alerts()).toHaveLength(1);
        expect(alerts()[0].to).toContain(superAdmin.email);
        expect(alerts()[0].text).toContain('API Playtomic indisponible');

        fake.failWith = null;
        expect((await sync.syncClub(c.id)).status).toBe('SUCCESS'); // réarme l'alerte
        fake.failWith = 'Toujours en panne';
        for (let i = 0; i < 3; i++) await sync.syncClub(c.id);
        expect(alerts()).toHaveLength(2);
      } finally {
        fake.failWith = null;
      }
    });
  });
});
