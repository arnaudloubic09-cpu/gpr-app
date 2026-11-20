import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { Club, PrismaClient, Role, User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { addMonths } from '@gpr/core';
import { LedgerService } from '../src/ledger/ledger.service';
import { CouponsService } from '../src/rewards/coupons.service';
import { TokenService } from '../src/auth/token.service';
import { CapturingMailService, createClub, createTestApp, createUser, login } from './helpers';

describe('Catalogue, échange de points et coupons (intégration)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let mail: CapturingMailService;
  let moduleRef: TestingModule;
  let ledger: LedgerService;
  let coupons: CouponsService;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, mail, moduleRef } = await createTestApp());
    ledger = moduleRef.get(LedgerService);
    coupons = moduleRef.get(CouponsService);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  let club: Club;
  let player: User;
  let auth: { Authorization: string };

  /** Crédite des points déjà validés (gain d'il y a 3 jours), dans le club du test par défaut. */
  async function credit(
    user: User,
    amount: number,
    opts: { pending?: boolean; clubId?: string } = {},
  ) {
    const earnedAt = new Date(Date.now() - 3 * 86_400_000);
    await prisma.ledgerEntry.create({
      data: {
        userId: user.id,
        type: 'EARN',
        amount,
        sourceType: 'BOOKING',
        sourceId: randomUUID(),
        idempotencyKey: `test:${randomUUID()}`,
        clubId: opts.clubId ?? club.id,
        earnedAt,
        availableAt: opts.pending ? new Date(Date.now() + 3600_000) : earnedAt,
        expiresAt: addMonths(earnedAt, 12),
      },
    });
  }
  const reward = (data: Partial<Parameters<typeof prisma.reward.create>[0]['data']> = {}) =>
    prisma.reward.create({
      data: {
        clubId: club.id,
        category: 'DRINK',
        kind: 'FREE_ITEM',
        title: 'Bière offerte',
        costGpr: 80,
        ...data,
      } as never,
    });
  const redeem = (rewardId: string, requestId = randomUUID(), headers = auth) =>
    http().post(`/rewards/${rewardId}/redeem`).set(headers).send({ requestId });

  beforeEach(async () => {
    club = await createClub(prisma);
    player = await createUser(prisma, Role.PLAYER);
    auth = {
      Authorization: `Bearer ${(await login(app, mail, player.email, 'MOBILE')).accessToken}`,
    };
  });

  describe('catalogue', () => {
    it('affiche les récompenses actives et dans leur période, avec la disponibilité du stock', async () => {
      await reward({ title: 'Active' });
      await reward({ title: 'Épuisée', stock: 0 });
      await reward({ title: 'Inactive', isActive: false });
      await reward({ title: 'Terminée', endsAt: new Date(Date.now() - 1000) });
      await reward({ title: 'Future', startsAt: new Date(Date.now() + 86_400_000) });
      const res = await http().get(`/clubs/${club.id}/rewards`).set(auth).expect(200);
      expect(
        res.body.map((r: { title: string; available: boolean }) => [r.title, r.available]).sort(),
      ).toEqual([
        ['Active', true],
        ['Épuisée', false],
      ]);
    });
  });

  describe('échange', () => {
    it('déduit les points GPR et génère un coupon à usage unique valable 7 jours', async () => {
      await credit(player, 100);
      const r = await reward();
      const res = await redeem(r.id).expect(201);
      expect(res.body).toMatchObject({
        status: 'ACTIVE',
        costGpr: 80,
        reward: { id: r.id },
        club: { id: club.id },
      });
      expect(res.body.code).toMatch(/^GPR-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      const days = (new Date(res.body.expiresAt).getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(6.9);
      expect(days).toBeLessThanOrEqual(7);
      expect((await ledger.balance(player.id)).available).toBe(20);
    });

    it('refuse si le solde est insuffisant', async () => {
      await credit(player, 50);
      const r = await reward();
      const res = await redeem(r.id).expect(422);
      expect(res.body.code).toBe('INSUFFICIENT_BALANCE');
    });

    it('les points « en attente » ne sont pas utilisables', async () => {
      await credit(player, 200, { pending: true });
      await redeem((await reward()).id).expect(422);
    });

    it('deux échanges simultanés ne dépensent jamais deux fois les mêmes points', async () => {
      await credit(player, 100);
      const r = await reward();
      const results = await Promise.all([redeem(r.id), redeem(r.id), redeem(r.id)]);
      expect(results.map((x) => x.status).sort()).toEqual([201, 422, 422]);
      expect((await ledger.balance(player.id)).available).toBe(20);
    });

    it('un double appui (même requestId) ne crée qu’un seul coupon', async () => {
      await credit(player, 500);
      const r = await reward();
      const requestId = randomUUID();
      const [a, b] = await Promise.all([redeem(r.id, requestId), redeem(r.id, requestId)]);
      expect(a.body.id).toBeDefined();
      expect(b.body.id).toBe(a.body.id);
      expect(await prisma.coupon.count({ where: { userId: player.id } })).toBe(1);
      expect((await ledger.balance(player.id)).available).toBe(420);
    });

    it('gère le stock : rupture quand il est épuisé', async () => {
      await credit(player, 500);
      const r = await reward({ stock: 1 });
      await redeem(r.id).expect(201);
      const res = await redeem(r.id).expect(409);
      expect(res.body.code).toBe('OUT_OF_STOCK');
      expect((await ledger.balance(player.id)).available).toBe(420);
    });

    it('refuse une récompense inactive ou hors période', async () => {
      await credit(player, 500);
      await redeem((await reward({ isActive: false })).id).expect(404);
      await redeem((await reward({ endsAt: new Date(Date.now() - 1000) })).id).expect(404);
    });

    it('accepte une réduction sur un cours (jamais un cours gratuit, garanti en base)', async () => {
      await credit(player, 500);
      const r = await reward({
        category: 'LESSON',
        kind: 'DISCOUNT_PERCENT',
        discountValue: 20,
        title: '-20 % cours',
        costGpr: 250,
      });
      await redeem(r.id).expect(201);
    });

    it('les points ne sont utilisables que dans le club où ils ont été gagnés', async () => {
      const other = await createClub(prisma, 'Autre club');
      await credit(player, 100, { clubId: other.id });
      // Récompense de « club » : les points gagnés dans l'autre club ne comptent pas
      const here = await reward({ costGpr: 50 });
      const res = await redeem(here.id).expect(422);
      expect(res.body.code).toBe('INSUFFICIENT_BALANCE');
      expect(res.body.message).toContain(club.name);
      // Dans le club où ils ont été gagnés : OK
      const there = await prisma.reward.create({
        data: {
          clubId: other.id,
          category: 'SNACK',
          kind: 'FREE_ITEM',
          title: 'Pizza',
          costGpr: 100,
        },
      });
      await redeem(there.id).expect(201);
      const balance = await ledger.balance(player.id);
      // Plus aucun point dans ce club : il n'apparaît plus dans le solde
      expect(balance.available).toBe(0);
      expect(balance.clubs.find((c) => c.club.id === other.id)).toBeUndefined();
    });

    it('le club principal apparaît en premier, même sans aucun point', async () => {
      const fav = await createClub(prisma, 'Club principal');
      await prisma.user.update({ where: { id: player.id }, data: { favoriteClubId: fav.id } });
      await credit(player, 520);
      const res = await http().get('/me/balance').set(auth).expect(200);
      expect(
        res.body.clubs.map((c: { club: { id: string }; available: number; favorite: boolean }) => [
          c.club.id,
          c.available,
          c.favorite,
        ]),
      ).toEqual([
        [fav.id, 0, true],
        [club.id, 520, false],
      ]);
    });

    it('solde affiché club par club', async () => {
      const other = await createClub(prisma, 'Autre club');
      await credit(player, 120);
      await credit(player, 30, { clubId: other.id });
      const res = await http().get('/me/balance').set(auth).expect(200);
      expect(res.body.available).toBe(150);
      expect(
        res.body.clubs.map((c: { club: { id: string }; available: number }) => [
          c.club.id,
          c.available,
        ]),
      ).toEqual([
        [club.id, 120],
        [other.id, 30],
      ]);
    });

    it('un compte admin ne peut pas échanger de points', async () => {
      const admin = await createUser(prisma, Role.CLUB_ADMIN, club.id);
      const tok = (await login(app, mail, admin.email, 'ADMIN')).accessToken;
      await redeem((await reward()).id, randomUUID(), { Authorization: `Bearer ${tok}` }).expect(
        403,
      );
    });
  });

  describe('coupons', () => {
    it('le joueur annule un coupon non utilisé : points et stock restitués, une seule fois', async () => {
      await credit(player, 100);
      const r = await reward({ stock: 5 });
      const { body: coupon } = await redeem(r.id).expect(201);

      const res = await http().post(`/me/coupons/${coupon.id}/cancel`).set(auth).expect(200);
      expect(res.body.status).toBe('CANCELLED');
      await http().post(`/me/coupons/${coupon.id}/cancel`).set(auth).expect(404);

      expect((await ledger.balance(player.id)).available).toBe(100);
      expect((await prisma.reward.findUniqueOrThrow({ where: { id: r.id } })).stock).toBe(5);
      const refunds = await prisma.ledgerEntry.findMany({
        where: { userId: player.id, type: 'REFUND' },
      });
      expect(refunds.map((e) => e.amount)).toEqual([80]);
    });

    it('un joueur ne peut pas annuler le coupon d’un autre', async () => {
      await credit(player, 100);
      const { body: coupon } = await redeem((await reward()).id).expect(201);
      const other = await createUser(prisma, Role.PLAYER);
      const tok = (await login(app, mail, other.email, 'MOBILE')).accessToken;
      await http()
        .post(`/me/coupons/${coupon.id}/cancel`)
        .set({ Authorization: `Bearer ${tok}` })
        .expect(404);
    });

    it('un coupon non utilisé au bout de 7 jours expire et les points sont remboursés automatiquement', async () => {
      await credit(player, 100);
      const { body: coupon } = await redeem((await reward()).id).expect(201);
      const later = new Date(Date.now() + 8 * 86_400_000);

      expect(await coupons.expireDue(later)).toBeGreaterThanOrEqual(1);
      await coupons.expireDue(later); // relance : aucun double remboursement

      const c = await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } });
      expect(c.status).toBe('EXPIRED');
      expect(await prisma.ledgerEntry.count({ where: { userId: player.id, type: 'REFUND' } })).toBe(
        1,
      );
      expect((await ledger.balance(player.id)).available).toBe(100);
    });

    it('liste les coupons actifs et l’historique séparément', async () => {
      await credit(player, 300);
      const r = await reward();
      const { body: kept } = await redeem(r.id).expect(201);
      const { body: cancelled } = await redeem(r.id).expect(201);
      await http().post(`/me/coupons/${cancelled.id}/cancel`).set(auth).expect(200);

      const active = await http().get('/me/coupons').set(auth).expect(200);
      const history = await http().get('/me/coupons?scope=history').set(auth).expect(200);
      expect(active.body.map((c: { id: string }) => c.id)).toEqual([kept.id]);
      expect(history.body.map((c: { id: string }) => c.id)).toEqual([cancelled.id]);
    });

    it('l’historique des transactions montre l’échange puis le remboursement', async () => {
      await credit(player, 100);
      const { body: coupon } = await redeem((await reward()).id).expect(201);
      await http().post(`/me/coupons/${coupon.id}/cancel`).set(auth).expect(200);
      const tx = await http().get('/me/transactions').set(auth).expect(200);
      expect(
        tx.body.items
          .slice(0, 2)
          .map((t: { label: string; amount: number }) => [t.label, t.amount]),
      ).toEqual([
        ['Coupon remboursé', 80],
        ['Récompense échangée', -80],
      ]);
    });
  });

  describe('profil et liaison de compte', () => {
    it('le joueur renseigne son profil et son club favori', async () => {
      const res = await http()
        .patch('/me')
        .set(auth)
        .send({ firstName: 'Julien', lastName: 'Martin', favoriteClubId: club.id })
        .expect(200);
      expect(res.body).toMatchObject({ firstName: 'Julien', favoriteClubId: club.id });
      await http().patch('/me').set(auth).send({ role: 'SUPER_ADMIN' }).expect(400);
      await http().patch('/me').set(auth).send({ favoriteClubId: randomUUID() }).expect(400);
    });

    it('lie le compte de réservation par email (connecteur simulé), sans doublon', async () => {
      await prisma.clubConnectorConfig.create({
        data: { clubId: club.id, provider: 'MOCK', externalClubId: 'ext' },
      });
      const email = 'joueur29@gpr.example';
      await prisma.playerExternalLink.deleteMany({
        where: { OR: [{ externalPlayerId: 'mock-player-29' }, { user: { email } }] },
      });
      const p = await prisma.user.upsert({
        where: { email },
        update: {},
        create: { email, role: 'PLAYER' },
      });
      // Email fixe (requis par le connecteur simulé) : jetons émis directement, sans OTP,
      // pour ne pas atteindre la limite de demandes de code quand on relance les tests.
      const tok = {
        Authorization: `Bearer ${(await moduleRef.get(TokenService).issue(p)).accessToken}`,
      };

      const first = await http().post('/me/link-account').set(tok).expect(200);
      expect(first.body).toContainEqual({ provider: 'MOCK', status: 'LINKED' });
      const second = await http().post('/me/link-account').set(tok).expect(200);
      expect(second.body).toContainEqual({ provider: 'MOCK', status: 'ALREADY_LINKED' });
      const links = await http().get('/me/links').set(tok).expect(200);
      expect(links.body).toHaveLength(1);
    });
  });
});
