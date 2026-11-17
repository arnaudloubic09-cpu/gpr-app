import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { Club, PrismaClient, Role, User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { addMonths } from '@gpr/core';
import { TokenService } from '../src/auth/token.service';
import { GamificationService } from '../src/gamification/gamification.service';
import { GdprService } from '../src/gamification/gdpr.service';
import { LogPushSender, PushSender } from '../src/gamification/push-sender';
import { CapturingMailService, createClub, createTestApp, createUser } from './helpers';

/**
 * Phase 5 : défis, badges, niveaux, avantages, notifications, RGPD.
 * Dates en heure de Paris (novembre = UTC+1). 2026-11-16 = lundi (semaine 47).
 */
describe('Gamification, notifications et RGPD (intégration)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let mail: CapturingMailService;
  let moduleRef: TestingModule;
  let gamification: GamificationService;
  let push: LogPushSender;
  const http = () => request(app.getHttpServer());
  const as = async (u: User) => ({
    Authorization: `Bearer ${(await moduleRef.get(TokenService).issue(u)).accessToken}`,
  });
  const at = (local: string) => new Date(`${local}:00+01:00`);

  beforeAll(async () => {
    ({ app, mail, moduleRef } = await createTestApp());
    gamification = moduleRef.get(GamificationService);
    push = moduleRef.get(PushSender) as LogPushSender;
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  let club: Club;
  let other: Club;
  let player: User;

  /** Partie terminée et créditée (EARN), validée à H+2. */
  async function played(user: User, local: string, c: Club = club, minutes = 90, amount = 30) {
    const startsAt = at(local);
    const endsAt = new Date(startsAt.getTime() + minutes * 60_000);
    const booking = await prisma.booking.create({
      data: {
        clubId: c.id,
        provider: 'MOCK',
        externalId: randomUUID(),
        startsAt,
        endsAt,
        status: 'COMPLETED',
      },
    });
    await prisma.ledgerEntry.create({
      data: {
        userId: user.id,
        type: 'EARN',
        amount,
        sourceType: 'BOOKING',
        sourceId: booking.id,
        clubId: c.id,
        idempotencyKey: `booking:${booking.id}:user:${user.id}:earn`,
        earnedAt: endsAt,
        availableAt: new Date(endsAt.getTime() + 2 * 3600_000),
        expiresAt: addMonths(endsAt, 12),
      },
    });
    return booking;
  }
  async function challenge(data: Record<string, unknown>) {
    return prisma.challenge.create({
      data: {
        name: `Défi ${randomUUID().slice(0, 4)}`,
        description: 'test',
        trigger: 'BOOKING_VALIDATED',
        period: 'WEEK',
        startsAt: new Date('2026-01-01T00:00:00Z'),
        ...data,
      } as never,
    });
  }
  const run = (local: string) => gamification.run(at(local));

  beforeEach(async () => {
    club = await createClub(prisma, 'Club Défis');
    other = await createClub(prisma, 'Club Voisin');
    player = await prisma.user.create({
      data: { email: `${randomUUID()}@t.example`, firstName: 'Inès', lastName: 'Garcia' },
    });
    // Isole chaque test : la tâche ne regarde que ses propres données (curseur remis en arrière).
    await prisma.jobState.deleteMany({ where: { key: 'gamification.watermark' } });
    // Les défis créés par d'autres tests restent actifs : on les désactive pour ne compter que les nôtres.
    await prisma.challenge.updateMany({ where: { isActive: true }, data: { isActive: false } });
  });

  describe('défis', () => {
    it('« 3 parties cette semaine » : récompense unique, et seulement pour des parties validées', async () => {
      const c = await challenge({
        clubId: null,
        condition: { type: 'COUNT', target: 3 },
        rewardGpr: 50,
      });
      await played(player, '2026-11-16T18:00');
      await played(player, '2026-11-17T18:00');
      await played(player, '2026-11-18T18:00'); // validée le 18 à 21:30
      await run('2026-11-18T20:00'); // 3e partie pas encore validée
      expect(
        await prisma.ledgerEntry.count({ where: { userId: player.id, type: 'CHALLENGE' } }),
      ).toBe(0);

      await run('2026-11-18T22:00');
      await run('2026-11-19T10:00');
      const rewards = await prisma.ledgerEntry.findMany({
        where: { userId: player.id, type: 'CHALLENGE' },
      });
      expect(rewards.map((r) => [r.amount, r.sourceId])).toEqual([[50, c.id]]);
      const notifs = await prisma.notification.findMany({
        where: { userId: player.id, type: 'CHALLENGE_COMPLETED' },
      });
      expect(notifs).toHaveLength(1);
    });

    it('chaque semaine est un nouveau défi', async () => {
      await challenge({ clubId: null, condition: { type: 'COUNT', target: 1 }, rewardGpr: 10 });
      await played(player, '2026-11-16T18:00');
      await run('2026-11-17T12:00');
      await played(player, '2026-11-24T18:00');
      await run('2026-11-25T12:00');
      expect(
        await prisma.ledgerEntry.count({ where: { userId: player.id, type: 'CHALLENGE' } }),
      ).toBe(2);
    });

    it('défi de club : seules les parties du club comptent ; badge attribué une seule fois', async () => {
      const badge = await prisma.badge.create({
        data: { code: `B${Date.now()}`, name: 'Fidèle', description: 'test', icon: 'star' },
      });
      await challenge({
        clubId: club.id,
        condition: { type: 'COUNT', target: 2 },
        rewardBadgeId: badge.id,
      });
      await played(player, '2026-11-16T18:00', club);
      await played(player, '2026-11-17T18:00', other);
      await run('2026-11-18T12:00');
      expect(await prisma.playerBadge.count({ where: { userId: player.id } })).toBe(0);
      await played(player, '2026-11-19T18:00', club);
      await run('2026-11-20T12:00');
      await run('2026-11-21T12:00');
      expect(
        await prisma.playerBadge.count({ where: { userId: player.id, badgeId: badge.id } }),
      ).toBe(1);
    });

    it('une partie annulée ne compte pas', async () => {
      await challenge({ clubId: null, condition: { type: 'COUNT', target: 2 }, rewardGpr: 20 });
      await played(player, '2026-11-16T18:00');
      const b = await played(player, '2026-11-17T18:00');
      const earn = await prisma.ledgerEntry.findFirstOrThrow({ where: { sourceId: b.id } });
      await prisma.ledgerEntry.create({
        data: {
          userId: player.id,
          type: 'REVERSAL',
          amount: -30,
          sourceType: 'BOOKING',
          sourceId: b.id,
          reversesEntryId: earn.id,
          idempotencyKey: `reversal:${earn.id}`,
          earnedAt: at('2026-11-17T19:00'),
          availableAt: earn.availableAt,
        },
      });
      await run('2026-11-18T12:00');
      expect(
        await prisma.ledgerEntry.count({ where: { userId: player.id, type: 'CHALLENGE' } }),
      ).toBe(0);
    });

    it('le joueur voit sa progression ; un admin club ne peut pas offrir plus de 200 points par défi', async () => {
      await challenge({
        clubId: null,
        condition: { type: 'COUNT', target: 50 },
        period: 'FIXED',
        rewardGpr: 10,
      });
      await played(player, '2026-11-16T18:00');
      const res = await http()
        .get('/me/challenges')
        .set(await as(player))
        .expect(200);
      const mine = res.body.active.find(
        (c: { progress: { target: number } }) => c.progress.target === 50,
      );
      expect(mine).toMatchObject({ objective: 'Jouer 50 parties', progress: { value: 1 } });

      const admin = await createUser(prisma, Role.CLUB_ADMIN, club.id);
      const body = {
        name: 'Gros défi',
        description: 'Beaucoup de points',
        period: 'MONTH',
        startsAt: '2026-11-01',
        condition: { type: 'COUNT', target: 4 },
      };
      await http()
        .post(`/clubs/${club.id}/admin/challenges`)
        .set(await as(admin))
        .send({ ...body, rewardGpr: 500 })
        .expect(403);
      await http()
        .post(`/clubs/${club.id}/admin/challenges`)
        .set(await as(admin))
        .send({ ...body, rewardGpr: 100 })
        .expect(201);
      await http()
        .post(`/clubs/${club.id}/admin/challenges`)
        .set(await as(admin))
        .send({ ...body, condition: { type: 'DISTINCT_CLUBS', target: 2 }, rewardGpr: 50 })
        .expect(400);
      await http()
        .post(`/clubs/${club.id}/admin/challenges`)
        .set(await as(admin))
        .send({ ...body, rewardGpr: null })
        .expect(400);
    });
  });

  describe('niveaux et avantages', () => {
    it('carte de membre : niveau, avantages du club (cumul, meilleure réduction) et lecture au comptoir', async () => {
      await prisma.levelPerk.createMany({
        data: [
          {
            clubId: club.id,
            levelCode: 'SILVER',
            category: 'EQUIPMENT',
            discountPercent: 5,
            label: '-5 % shop',
          },
          {
            clubId: club.id,
            levelCode: 'GOLD',
            category: 'EQUIPMENT',
            discountPercent: 10,
            label: '-10 % shop',
          },
          {
            clubId: club.id,
            levelCode: 'GOLD',
            category: 'TOURNAMENT',
            discountPercent: 10,
            label: '-10 % tournois',
          },
        ],
      });
      await prisma.ledgerEntry.create({
        data: {
          userId: player.id,
          type: 'EARN',
          amount: 1600,
          sourceType: 'BOOKING',
          sourceId: randomUUID(),
          idempotencyKey: `t:${randomUUID()}`,
          earnedAt: new Date(Date.now() - 86_400_000),
          availableAt: new Date(Date.now() - 86_400_000),
          expiresAt: addMonths(new Date(), 11),
        },
      });
      const card = await http()
        .get('/me/member-card')
        .set(await as(player))
        .expect(200);
      expect(card.body.memberCode).toMatch(/^GPRM-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      expect(card.body.level.current.code).toBe('GOLD');
      const here = card.body.clubs.find((c: { club: { id: string } }) => c.club.id === club.id);
      expect(here.perks.map((p: { label: string }) => p.label).sort()).toEqual([
        '-10 % shop',
        '-10 % tournois',
      ]);
      // Code stable
      expect(
        (
          await http()
            .get('/me/member-card')
            .set(await as(player))
        ).body.memberCode,
      ).toBe(card.body.memberCode);

      const admin = await createUser(prisma, Role.CLUB_ADMIN, club.id);
      const check = await http()
        .get(`/clubs/${club.id}/members/${card.body.memberCode.toLowerCase()}`)
        .set(await as(admin))
        .expect(200);
      expect(check.body).toMatchObject({
        player: { firstName: 'Inès', lastInitial: 'G' },
        level: { label: 'Or' },
      });
      expect(check.body.perks).toHaveLength(2);
      await http()
        .get(`/clubs/${club.id}/members/GPRM-AAAA-AAAA`)
        .set(await as(admin))
        .expect(404);
    });

    it('un club ne peut pas créer d’avantage sur une partie de padel ni au-delà de 50 %', async () => {
      const h = await as(await createUser(prisma, Role.CLUB_ADMIN, club.id));
      await http()
        .post(`/clubs/${club.id}/admin/perks`)
        .set(h)
        .send({ levelCode: 'GOLD', category: 'BOOKING', discountPercent: 10, label: 'partie' })
        .expect(400);
      await http()
        .post(`/clubs/${club.id}/admin/perks`)
        .set(h)
        .send({ levelCode: 'GOLD', category: 'EQUIPMENT', discountPercent: 80, label: 'trop' })
        .expect(400);
      await http()
        .post(`/clubs/${club.id}/admin/perks`)
        .set(h)
        .send({
          levelCode: 'DIAMOND',
          category: 'EQUIPMENT',
          discountPercent: 10,
          label: 'inconnu',
        })
        .expect(400);
      await http()
        .post(`/clubs/${club.id}/admin/perks`)
        .set(h)
        .send({
          levelCode: 'GOLD',
          category: 'TOURNAMENT',
          discountPercent: 10,
          label: '-10 % tournois',
        })
        .expect(201);
      await http()
        .post(`/clubs/${other.id}/admin/perks`)
        .set(h)
        .send({ levelCode: 'GOLD', category: 'TOURNAMENT', discountPercent: 10, label: 'x autre' })
        .expect(403);
    });

    it('passage de niveau notifié une seule fois', async () => {
      await played(player, '2026-11-16T18:00', club, 90, 600);
      await run('2026-11-17T12:00');
      await run('2026-11-18T12:00');
      expect(
        await prisma.notification.count({ where: { userId: player.id, type: 'LEVEL_UP' } }),
      ).toBe(1);
    });
  });

  describe('notifications', () => {
    it('points validés notifiés une fois ; push envoyé seulement avec consentement et appareil', async () => {
      await prisma.pushToken.create({
        data: { userId: player.id, token: `ExponentPushToken[${randomUUID()}]`, platform: 'ios' },
      });
      const before = push.sent.length;
      await played(player, '2026-11-16T18:00');
      await run('2026-11-17T12:00');
      expect(
        await prisma.notification.count({ where: { userId: player.id, type: 'POINTS_VALIDATED' } }),
      ).toBe(1);
      expect(push.sent.length).toBe(before); // pas de consentement → pas de push

      await http()
        .put('/me/consents')
        .set(await as(player))
        .send([{ type: 'PUSH_NOTIFICATIONS', granted: true }])
        .expect(200);
      await played(player, '2026-11-18T18:00');
      await run('2026-11-19T12:00');
      await run('2026-11-19T13:00');
      expect(push.sent.length).toBe(before + 1);
      expect(push.sent[push.sent.length - 1].title).toBe('+30 points GPR');

      const list = await http()
        .get('/me/notifications')
        .set(await as(player))
        .expect(200);
      expect(list.body.unread).toBe(2);
      await http()
        .post('/me/notifications/read')
        .set(await as(player))
        .expect(204);
      expect(
        (
          await http()
            .get('/me/notifications')
            .set(await as(player))
        ).body.unread,
      ).toBe(0);
    });

    it('coupon qui expire demain : rappel unique', async () => {
      const reward = await prisma.reward.create({
        data: {
          clubId: club.id,
          category: 'DRINK',
          kind: 'FREE_ITEM',
          title: 'Bière',
          costGpr: 10,
        },
      });
      const entry = await prisma.ledgerEntry.create({
        data: {
          userId: player.id,
          type: 'REDEEM',
          amount: -10,
          sourceType: 'REDEMPTION',
          idempotencyKey: `t:${randomUUID()}`,
          earnedAt: new Date(),
          availableAt: new Date(),
        },
      });
      await prisma.coupon.create({
        data: {
          code: `GPR-T${randomUUID().slice(0, 3).toUpperCase()}-TEST`.slice(0, 13),
          userId: player.id,
          rewardId: reward.id,
          clubId: club.id,
          ledgerEntryId: entry.id,
          expiresAt: new Date(Date.now() + 20 * 3600_000),
        },
      });
      await gamification.couponReminders();
      await gamification.couponReminders();
      expect(
        await prisma.notification.count({ where: { userId: player.id, type: 'COUPON_EXPIRING' } }),
      ).toBe(1);
    });

    it('nouvelle récompense : les joueurs dont c’est le club principal sont prévenus', async () => {
      await prisma.user.update({ where: { id: player.id }, data: { favoriteClubId: club.id } });
      const admin = await createUser(prisma, Role.CLUB_ADMIN, club.id);
      await http()
        .post(`/clubs/${club.id}/admin/rewards`)
        .set(await as(admin))
        .send({ category: 'SNACK', kind: 'FREE_ITEM', title: 'Crêpe offerte', costGpr: 60 })
        .expect(201);
      const n = await prisma.notification.findFirstOrThrow({
        where: { userId: player.id, type: 'NEW_REWARD' },
      });
      expect(n.body).toContain('Crêpe offerte');
    });
  });

  describe('RGPD', () => {
    it('consentements historisés et export complet (y compris par email)', async () => {
      const h = await as(player);
      await http()
        .put('/me/consents')
        .set(h)
        .send([
          { type: 'TERMS', granted: true },
          { type: 'MARKETING_EMAIL', granted: false },
        ])
        .expect(200);
      await http()
        .put('/me/consents')
        .set(h)
        .send([{ type: 'MARKETING_EMAIL', granted: true }])
        .expect(200);
      const consents = (await http().get('/me/consents').set(h)).body;
      expect(consents.find((c: { type: string }) => c.type === 'MARKETING_EMAIL').granted).toBe(
        true,
      );
      expect(await prisma.consent.count({ where: { userId: player.id } })).toBe(3);

      await played(player, '2026-11-16T18:00');
      const exp = await http().get('/me/export').set(h).expect(200);
      expect(exp.body).toMatchObject({ email: player.email, firstName: 'Inès' });
      expect(exp.body.ledger).toHaveLength(1);
      expect(exp.body.consents).toHaveLength(3);
      await http().post('/me/export').set(h).expect(202);
      expect(mail.attachments.find((a) => a.to === player.email)?.filename).toBe(
        'mes-donnees-gpr.json',
      );
    });

    it('suppression : 30 jours de rétractation, puis anonymisation (ledger conservé sans donnée personnelle)', async () => {
      const h = await as(player);
      await played(player, '2026-11-16T18:00');
      await prisma.playerExternalLink.create({
        data: { userId: player.id, provider: 'MOCK', externalPlayerId: randomUUID() },
      });
      const req = await http().post('/me/deletion').set(h).expect(201);
      const scheduled = new Date(req.body.deletionScheduledFor);
      expect(Math.round((scheduled.getTime() - Date.now()) / 86_400_000)).toBe(30);
      expect((await http().get('/me').set(h)).body.deletionScheduledFor).toBeTruthy();

      // Rétractation
      await http().delete('/me/deletion').set(h).expect(204);
      const gdpr = moduleRef.get(GdprService);
      expect(
        await gdpr.runDueDeletions(new Date(Date.now() + 31 * 86_400_000)),
      ).toBeGreaterThanOrEqual(0);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: player.id } })).anonymizedAt,
      ).toBeNull();

      // Nouvelle demande, puis échéance
      await http().post('/me/deletion').set(h).expect(201);
      await gdpr.runDueDeletions(new Date(Date.now() + 10 * 86_400_000));
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: player.id } })).anonymizedAt,
      ).toBeNull(); // pas encore
      await gdpr.runDueDeletions(new Date(Date.now() + 31 * 86_400_000));

      const u = await prisma.user.findUniqueOrThrow({ where: { id: player.id } });
      expect(u).toMatchObject({ firstName: null, lastName: null, phone: null, memberCode: null });
      expect(u.email).toMatch(/@anonymise\.invalid$/);
      expect(await prisma.playerExternalLink.count({ where: { userId: player.id } })).toBe(0);
      expect(await prisma.ledgerEntry.count({ where: { userId: player.id } })).toBe(1); // conservé, anonyme
      await http().get('/me').set(h).expect(401);
      // L'email est libéré : la personne peut recréer un compte
      await http()
        .post('/auth/otp/request')
        .send({ email: player.email, audience: 'MOBILE' })
        .expect(202);
      expect(mail.lastCodeFor(player.email)).toBeDefined();
    });
  });
});
