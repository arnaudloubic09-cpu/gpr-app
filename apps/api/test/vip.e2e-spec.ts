import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { PrismaClient, Role, User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { addMonths, DEFAULT_VIP_SETTINGS } from '@gpr/core';
import { TokenService } from '../src/auth/token.service';
import { VipService } from '../src/vip/vip.service';
import { CapturingMailService, createClub, createTestApp, createUser } from './helpers';

describe('Carte VIP et partenaires (intégration)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let mail: CapturingMailService;
  let moduleRef: TestingModule;
  let vip: VipService;
  let superAdmin: User;
  const http = () => request(app.getHttpServer());
  const as = async (u: User) => ({
    Authorization: `Bearer ${(await moduleRef.get(TokenService).issue(u)).accessToken}`,
  });
  const setVip = async (enabled: boolean) =>
    http()
      .put('/admin/vip/settings')
      .set(await as(superAdmin))
      .send({ ...DEFAULT_VIP_SETTINGS, enabled })
      .expect(200);

  beforeAll(async () => {
    ({ app, mail, moduleRef } = await createTestApp());
    vip = moduleRef.get(VipService);
    superAdmin = await createUser(prisma, Role.SUPER_ADMIN);
  });
  afterAll(async () => {
    await setVip(false);
    await app.close();
    await prisma.$disconnect();
  });

  const newPlayer = () =>
    prisma.user.create({ data: { email: `${randomUUID()}@t.example`, firstName: 'Léo' } });
  async function partnerWithCodes(n: number, extra: Record<string, unknown> = {}) {
    const res = await http()
      .post('/admin/vip/partners')
      .set(await as(superAdmin))
      .send({
        name: `Shop ${randomUUID().slice(0, 4)}`,
        offer: '-15 % sur tout le site',
        websiteUrl: 'https://example.com',
        ...extra,
      })
      .expect(201);
    const codes = Array.from({ length: n }, (_, i) => `CODE-${res.body.id.slice(0, 6)}-${i}`).join(
      '\n',
    );
    if (n)
      await http()
        .post(`/admin/vip/partners/${res.body.id}/codes`)
        .set(await as(superAdmin))
        .send({ codes })
        .expect(201);
    return res.body as { id: string; name: string };
  }

  const DAY = 86_400_000;
  /** n parties validées (une réservation chacune), jouées il y a `daysAgo` jours. */
  async function games(
    user: User,
    n: number,
    daysAgo = 1,
    extra: { availableInDays?: number } = {},
  ) {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const t = new Date(Date.now() - daysAgo * DAY - i * 60_000);
      const avail = extra.availableInDays ? new Date(Date.now() + extra.availableInDays * DAY) : t;
      const e = await prisma.ledgerEntry.create({
        data: {
          userId: user.id,
          type: 'EARN',
          amount: 30,
          sourceType: 'BOOKING',
          sourceId: randomUUID(),
          idempotencyKey: `t:${randomUUID()}`,
          earnedAt: t,
          availableAt: avail,
          expiresAt: addMonths(t, 12),
        },
      });
      ids.push(e.id);
    }
    return ids;
  }
  const status = async (u: User) =>
    (
      await http()
        .get('/me/vip')
        .set(await as(u))
        .expect(200)
    ).body;

  it('désactivée : rien n’est visible ni attribué côté joueur', async () => {
    await setVip(false);
    const p = await newPlayer();
    await games(p, 12);
    expect(await vip.refreshGamesMemberships()).toBe(0);
    expect(await status(p)).toEqual({ enabled: false });
    await http()
      .get('/me/vip/partners')
      .set(await as(p))
      .expect(404);
    expect(
      (
        await http()
          .get('/me/member-card')
          .set(await as(p))
      ).body.vip,
    ).toBeNull();
  });

  it('VIP gratuit dès 10 parties sur 12 mois ; les parties annulées, en attente ou trop anciennes ne comptent pas', async () => {
    await setVip(true);
    const p = await newPlayer();
    const [reversed] = await games(p, 9);
    await games(p, 3, 400); // plus de 12 mois
    await games(p, 2, 0, { availableInDays: 1 }); // pas encore validées
    expect(await status(p)).toMatchObject({
      enabled: true,
      active: false,
      games: 9,
      gamesRequired: 10,
      sources: [],
    });

    await games(p, 1, 2);
    const s = await status(p);
    expect(s).toMatchObject({ active: true, games: 10, sources: ['GAMES'] });
    // Valable jusqu'à 12 mois après la plus ancienne des 10 parties (il y a 2 jours)
    expect(Math.round((new Date(s.until).getTime() - Date.now()) / DAY)).toBe(363);
    expect(
      (
        await http()
          .get('/me/member-card')
          .set(await as(p))
      ).body.vip,
    ).toMatchObject({ active: true });

    // Une partie annulée par le club ne compte plus
    await prisma.ledgerEntry.create({
      data: {
        userId: p.id,
        type: 'REVERSAL',
        amount: -30,
        sourceType: 'BOOKING',
        reversesEntryId: reversed,
        idempotencyKey: `t:${randomUUID()}`,
        earnedAt: new Date(),
        availableAt: new Date(),
      },
    });
    expect(await status(p)).toMatchObject({ active: false, games: 9 });
  });

  it('une même réservation recréditée (changement de joueurs) compte pour une seule partie', async () => {
    await setVip(true);
    const p = await newPlayer();
    await games(p, 9);
    const bookingId = randomUUID();
    for (const k of ['a', 'b']) {
      await prisma.ledgerEntry.create({
        data: {
          userId: p.id,
          type: 'EARN',
          amount: 10,
          sourceType: 'BOOKING',
          sourceId: bookingId,
          idempotencyKey: `t:${bookingId}:${k}`,
          earnedAt: new Date(Date.now() - DAY),
          availableAt: new Date(Date.now() - DAY),
        },
      });
    }
    expect(await status(p)).toMatchObject({ games: 10, active: true });
  });

  it('statut glissant : la carte s’arrête quand les parties sortent des 12 derniers mois', async () => {
    await setVip(true);
    const p = await newPlayer();
    await games(p, 10, 360);
    expect((await status(p)).active).toBe(true);
    const inTenDays = new Date(Date.now() + 10 * DAY);
    expect((await vip.status(p.id, inTenDays)).active).toBe(false);
  });

  it('tâche quotidienne : enregistre la période VIP et prévient le joueur une seule fois', async () => {
    await setVip(true);
    const p = await newPlayer();
    await games(p, 10);
    await vip.refreshGamesMemberships();
    await vip.refreshGamesMemberships();
    const rows = await prisma.vipMembership.findMany({ where: { userId: p.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('GAMES');
    expect(
      await prisma.notification.count({
        where: { userId: p.id, title: 'Votre carte VIP est activée' },
      }),
    ).toBe(1);
    // Nouvelle partie : la période s'allonge, sans nouvelle notification
    await games(p, 1, 0);
    await vip.refreshGamesMemberships();
    const [after] = await prisma.vipMembership.findMany({ where: { userId: p.id } });
    expect(after.endsAt.getTime()).toBeGreaterThan(rows[0].endsAt.getTime());
  });

  it('attribution manuelle par le super admin (prolonge la carte en cours), avec audit', async () => {
    await setVip(true);
    const p = await newPlayer();
    const h = await as(superAdmin);
    await http()
      .post(`/admin/vip/players/${p.id}/grant`)
      .set(h)
      .send({ months: 12, reason: 'Vente au comptoir Toulouse' })
      .expect(201);
    const second = await http()
      .post(`/admin/vip/players/${p.id}/grant`)
      .set(h)
      .send({ months: 12, reason: 'Renouvellement' })
      .expect(201);
    expect(
      Math.round((new Date(second.body.endsAt).getTime() - Date.now()) / 86_400_000),
    ).toBeGreaterThanOrEqual(729);
    expect(await prisma.auditLog.count({ where: { entityId: p.id, action: 'vip.grant' } })).toBe(2);
    const admin = await createUser(prisma, Role.CLUB_ADMIN, (await createClub(prisma)).id);
    await http()
      .post(`/admin/vip/players/${p.id}/grant`)
      .set(await as(admin))
      .send({ months: 12, reason: 'Pas autorisé' })
      .expect(403);
  });

  it('plus d’achat de la carte : la carte est gratuite', async () => {
    await setVip(true);
    await http()
      .post('/me/vip/purchase')
      .set(await as(await newPlayer()))
      .expect(404);
  });

  describe('codes promo partenaires', () => {
    let member: User;
    beforeEach(async () => {
      await setVip(true);
      member = await newPlayer();
      await http()
        .post(`/admin/vip/players/${member.id}/grant`)
        .set(await as(superAdmin))
        .send({ months: 12, reason: 'Test codes partenaires' })
        .expect(201);
    });

    it('réservés aux membres VIP ; autant de codes que voulu, jamais le même deux fois', async () => {
      const partner = await partnerWithCodes(30);
      await http()
        .post(`/me/vip/partners/${partner.id}/code`)
        .set(await as(await newPlayer()))
        .expect(403);
      const h = await as(member);
      const codes = await Promise.all(
        [1, 2, 3, 4, 5].map(() =>
          http().post(`/me/vip/partners/${partner.id}/code`).set(h).expect(201),
        ),
      );
      const values = codes.map((c) => c.body.code);
      expect(new Set(values).size).toBe(5);
      const days = (new Date(codes[0].body.expiresAt).getTime() - Date.now()) / 86_400_000;
      expect(Math.round(days)).toBe(7);
      expect((await http().get('/me/vip/codes').set(h)).body).toHaveLength(5);
    });

    it('deux membres en même temps ne reçoivent jamais le même code', async () => {
      const partner = await partnerWithCodes(25);
      const other = await newPlayer();
      await http()
        .post(`/admin/vip/players/${other.id}/grant`)
        .set(await as(superAdmin))
        .send({ months: 12, reason: 'Test concurrence' })
        .expect(201);
      const [h1, h2] = [await as(member), await as(other)];
      const res = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          http()
            .post(`/me/vip/partners/${partner.id}/code`)
            .set(i % 2 ? h1 : h2),
        ),
      );
      const values = res.map((r) => r.body.code);
      expect(new Set(values).size).toBe(10);
    });

    it('plafond facultatif par partenaire ; liste épuisée ; alerte email unique quand il reste moins de 20 codes', async () => {
      const limited = await partnerWithCodes(5, { maxCodesPerMember: 2 });
      const h = await as(member);
      await http().post(`/me/vip/partners/${limited.id}/code`).set(h).expect(201);
      await http().post(`/me/vip/partners/${limited.id}/code`).set(h).expect(201);
      expect(
        (await http().post(`/me/vip/partners/${limited.id}/code`).set(h).expect(409)).body.code,
      ).toBe('LIMIT_REACHED');
      const alerts = mail.alerts.filter((a) => a.subject.includes(limited.name));
      expect(alerts).toHaveLength(1);
      expect(alerts[0].to).toContain(superAdmin.email);

      const empty = await partnerWithCodes(0);
      expect(
        (await http().post(`/me/vip/partners/${empty.id}/code`).set(h).expect(409)).body.code,
      ).toBe('NO_CODE');
    });

    it('import : doublons ignorés, les codes ne sont jamais écrits dans le journal', async () => {
      const partner = await partnerWithCodes(0);
      const res = await http()
        .post(`/admin/vip/partners/${partner.id}/codes`)
        .set(await as(superAdmin))
        .send({ codes: 'SECRET-1\nSECRET-2\nSECRET-1; SECRET-3' })
        .expect(201);
      expect(res.body).toMatchObject({ received: 3, added: 3, remaining: 3 });
      const again = await http()
        .post(`/admin/vip/partners/${partner.id}/codes`)
        .set(await as(superAdmin))
        .send({ codes: 'SECRET-3\nSECRET-4' })
        .expect(201);
      expect(again.body).toMatchObject({ added: 1, duplicates: 1, remaining: 4 });
      const audits = await prisma.auditLog.findMany({ where: { entityId: partner.id } });
      expect(JSON.stringify(audits)).not.toContain('SECRET-');
      const overview = await http()
        .get('/admin/vip')
        .set(await as(superAdmin))
        .expect(200);
      expect(overview.body.partners.find((p: { id: string }) => p.id === partner.id).codes).toEqual(
        { total: 4, assigned: 0, remaining: 4 },
      );
    });
  });
});
