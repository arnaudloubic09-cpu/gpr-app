import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { PrismaClient, Role, User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { addMonths, DEFAULT_VIP_SETTINGS } from '@gpr/core';
import { TokenService } from '../src/auth/token.service';
import { VipService } from '../src/vip/vip.service';
import { CapturingMailService, createTestApp, createUser } from './helpers';

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

  async function points(user: User, amount: number) {
    const t = new Date(Date.now() - 86_400_000);
    await prisma.ledgerEntry.create({
      data: {
        userId: user.id,
        type: 'EARN',
        amount,
        sourceType: 'BOOKING',
        sourceId: randomUUID(),
        idempotencyKey: `t:${randomUUID()}`,
        earnedAt: t,
        availableAt: t,
        expiresAt: addMonths(t, 12),
      },
    });
  }
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

  it('désactivée : rien n’est visible ni attribué côté joueur', async () => {
    await setVip(false);
    const p = await newPlayer();
    await points(p, 3500);
    expect(await vip.grantPlatinum()).toBe(0);
    expect(
      (
        await http()
          .get('/me/vip')
          .set(await as(p))
          .expect(200)
      ).body,
    ).toEqual({ enabled: false });
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

  it('à l’activation, les joueurs Platine reçoivent leur carte VIP pour 1 an (une seule fois)', async () => {
    const platinum = await newPlayer();
    await points(platinum, 3200);
    const gold = await newPlayer();
    await points(gold, 1600);
    await setVip(true); // attribue immédiatement
    await vip.grantPlatinum(); // relance : aucun doublon

    const s = (
      await http()
        .get('/me/vip')
        .set(await as(platinum))
        .expect(200)
    ).body;
    expect(s).toMatchObject({
      enabled: true,
      active: true,
      sources: ['PLATINUM'],
      freeLevel: { label: 'Platine' },
      priceCents: 6000,
      purchaseEnabled: false,
    });
    expect(
      Math.round((new Date(s.until).getTime() - Date.now()) / 86_400_000),
    ).toBeGreaterThanOrEqual(364);
    expect(await prisma.vipMembership.count({ where: { userId: platinum.id } })).toBe(1);
    expect(
      (
        await http()
          .get('/me/vip')
          .set(await as(gold))
      ).body.active,
    ).toBe(false);
    expect(
      (
        await http()
          .get('/me/member-card')
          .set(await as(platinum))
      ).body.vip,
    ).toMatchObject({ active: true });
  });

  it('garde sa carte pendant 1 an même s’il redescend, puis prolongation s’il est toujours Platine', async () => {
    await setVip(true);
    const p = await newPlayer();
    await points(p, 3100);
    await vip.grantPlatinum();
    // Redescend (annulations) : la carte reste valable
    await prisma.ledgerEntry.create({
      data: {
        userId: p.id,
        type: 'REVERSAL',
        amount: -2000,
        sourceType: 'BOOKING',
        idempotencyKey: `t:${randomUUID()}`,
        earnedAt: new Date(),
        availableAt: new Date(),
      },
    });
    expect(
      (
        await http()
          .get('/me/vip')
          .set(await as(p))
      ).body.active,
    ).toBe(true);
    // Un an plus tard, plus Platine : pas de prolongation
    const later = new Date(Date.now() + 366 * 86_400_000);
    await vip.grantPlatinum(later);
    expect(await prisma.vipMembership.count({ where: { userId: p.id } })).toBe(1);
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
    const admin = await createUser(
      prisma,
      Role.CLUB_ADMIN,
      (await prisma.club.findFirstOrThrow()).id,
    );
    await http()
      .post(`/admin/vip/players/${p.id}/grant`)
      .set(await as(admin))
      .send({ months: 12, reason: 'Pas autorisé' })
      .expect(403);
  });

  it('achat en ligne : message clair tant que le paiement n’est pas branché', async () => {
    await setVip(true);
    const res = await http()
      .post('/me/vip/purchase')
      .set(await as(await newPlayer()))
      .expect(503);
    expect(res.body.message).toContain('bientôt disponible');
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
