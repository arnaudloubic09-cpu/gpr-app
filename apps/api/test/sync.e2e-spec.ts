import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { Club, PrismaClient, Role, User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { Booking } from '@gpr/connectors';
import { DEFAULT_GPR_RULES } from '@gpr/core';
import { LedgerService } from '../src/ledger/ledger.service';
import { SyncService } from '../src/sync/sync.service';
import {
  CapturingMailService,
  createClub,
  createTestApp,
  createUser,
  FakeConnector,
  login,
} from './helpers';

/**
 * Moteur de points de bout en bout : synchronisation → ledger → solde.
 * Dates en heure de Paris, novembre = UTC+1. 2026-11-10 = mardi, 2026-11-14 = samedi.
 */
describe('Synchronisation et moteur de points (intégration)', () => {
  const prisma = new PrismaClient();
  const fake = new FakeConnector();
  let app: INestApplication;
  let mail: CapturingMailService;
  let moduleRef: TestingModule;
  let sync: SyncService;
  let ledger: LedgerService;

  const NOW = new Date('2026-11-17T12:00:00Z');
  const at = (local: string) => new Date(`${local}:00+01:00`);

  beforeAll(async () => {
    // Règles par défaut garanties dans la base de test (version la plus haute = active).
    const r = DEFAULT_GPR_RULES;
    await prisma.ruleSet.upsert({
      where: { version: 1 },
      update: {},
      create: {
        version: 1,
        pointsPerSlot: r.pointsPerSlot,
        slotMinutes: r.slotMinutes,
        dailyCapPerPlayer: null,
        pendingDelayMinutes: r.pendingDelayMinutes,
        expirationMonths: r.expirationMonths,
        offPeakMultiplier: r.offPeakMultiplier,
        offPeakWindows: r.offPeakWindows as never,
        levels: r.levels as never,
      },
    });
    ({ app, mail, moduleRef } = await createTestApp(fake));
    sync = moduleRef.get(SyncService);
    ledger = moduleRef.get(LedgerService);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // Chaque test a son propre club et ses propres joueurs (base de test partagée).
  let club: Club;
  let ext: string;
  let players: User[];
  const extId = (i: number) => `${ext}-p${i}`;

  beforeEach(async () => {
    club = await createClub(prisma);
    ext = randomUUID().slice(0, 8);
    await prisma.clubConnectorConfig.create({
      data: { clubId: club.id, provider: 'MOCK', externalClubId: ext },
    });
    players = [];
    for (let i = 1; i <= 4; i++) {
      const p = await createUser(prisma, Role.PLAYER);
      await prisma.playerExternalLink.create({
        data: {
          userId: p.id,
          provider: 'MOCK',
          externalPlayerId: extId(i),
          linkedAt: new Date('2025-01-01T00:00:00Z'),
        },
      });
      players.push(p);
    }
    fake.bookings = [];
    fake.participants = {};
    fake.failWith = null;
    fake.delayMs = 0;
  });

  function addBooking(
    id: string,
    start: string,
    end: string,
    opts: Partial<Booking> & { participants?: number[] } = {},
  ) {
    const externalId = `${ext}-${id}`;
    fake.bookings.push({
      provider: 'MOCK',
      externalId,
      externalClubId: ext,
      startsAt: at(start),
      endsAt: at(end),
      status: 'COMPLETED',
      bookerExternalId: extId(1),
      ...opts,
    });
    if (opts.participants)
      fake.participants[externalId] = opts.participants.map((i) => ({
        externalPlayerId: extId(i),
      }));
    return externalId;
  }
  const balanceOf = (u: User, now = NOW) => ledger.balance(u.id, now);

  it('crédite tous les participants identifiés (10 points GPR / 30 min)', async () => {
    addBooking('b1', '2026-11-10T18:00', '2026-11-10T19:30', { participants: [1, 2, 3, 4] });
    const res = await sync.syncClub(club.id, { now: NOW });
    expect(res.status).toBe('SUCCESS');
    for (const p of players) expect((await balanceOf(p)).available).toBe(30);
  });

  it('ignore les participants non identifiés (invités sans compte)', async () => {
    const id = addBooking('b1', '2026-11-10T18:00', '2026-11-10T19:00');
    fake.participants[id] = [
      { externalPlayerId: extId(2) },
      { externalPlayerId: 'invite-inconnu' },
    ];
    await sync.syncClub(club.id, { now: NOW });
    expect((await balanceOf(players[1])).available).toBe(20);
    expect((await balanceOf(players[0])).available).toBe(20); // réservataire
    expect((await balanceOf(players[2])).available).toBe(0);
  });

  it('à défaut de liste de participants, crédite uniquement le réservataire', async () => {
    addBooking('b1', '2026-11-10T18:00', '2026-11-10T19:00', { bookerExternalId: extId(3) });
    await sync.syncClub(club.id, { now: NOW });
    expect((await balanceOf(players[2])).available).toBe(20);
    expect((await balanceOf(players[0])).available).toBe(0);
  });

  it('IDEMPOTENCE : synchroniser deux fois ne crédite jamais deux fois', async () => {
    addBooking('b1', '2026-11-10T18:00', '2026-11-10T19:00', { participants: [1, 2] });
    const first = await sync.syncClub(club.id, { now: NOW });
    const second = await sync.syncClub(club.id, { now: NOW });
    expect(first.status === 'SUCCESS' && first.run.entriesCreated).toBe(2);
    expect(second.status === 'SUCCESS' && second.run.entriesCreated).toBe(0);
    expect((await balanceOf(players[0])).available).toBe(20);
    expect(await prisma.booking.count({ where: { clubId: club.id } })).toBe(1);
  });

  it('IDEMPOTENCE : deux synchros simultanées du même club → une seule s’exécute', async () => {
    addBooking('b1', '2026-11-10T18:00', '2026-11-10T19:00', { participants: [1] });
    fake.delayMs = 300;
    const results = await Promise.all([
      sync.syncClub(club.id, { now: NOW }),
      sync.syncClub(club.id, { now: NOW }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(['SKIPPED', 'SUCCESS']);
    expect((await balanceOf(players[0])).available).toBe(20);
  });

  it('partie annulée ou absence : 0 point GPR', async () => {
    addBooking('b1', '2026-11-10T18:00', '2026-11-10T19:00', {
      status: 'CANCELLED',
      participants: [1],
    });
    addBooking('b2', '2026-11-11T18:00', '2026-11-11T19:00', {
      status: 'NO_SHOW',
      participants: [1],
    });
    await sync.syncClub(club.id, { now: NOW });
    expect(await prisma.ledgerEntry.count({ where: { userId: players[0].id } })).toBe(0);
  });

  it('annulation après crédit : écriture d’annulation unique, solde remis à zéro', async () => {
    const id = addBooking('b1', '2026-11-10T18:00', '2026-11-10T19:00', { participants: [1, 2] });
    await sync.syncClub(club.id, { now: NOW });
    expect((await balanceOf(players[0])).available).toBe(20);

    fake.setStatus(id, 'NO_SHOW');
    await sync.syncClub(club.id, { now: NOW });
    await sync.syncClub(club.id, { now: NOW });

    const entries = await prisma.ledgerEntry.findMany({
      where: { userId: players[0].id },
      orderBy: { createdAt: 'asc' },
    });
    expect(entries.map((e) => [e.type, e.amount])).toEqual([
      ['EARN', 20],
      ['REVERSAL', -20],
    ]);
    expect((await balanceOf(players[0])).available).toBe(0);
  });

  it('points « en attente » jusqu’à H+2 après la fin du créneau', async () => {
    addBooking('b1', '2026-11-17T18:00', '2026-11-17T19:00', { participants: [1] }); // fin = 18:00Z
    const now = new Date('2026-11-17T18:05:00Z');
    await sync.syncClub(club.id, { now });
    expect(await balanceOf(players[0], now)).toMatchObject({ available: 0, pending: 20 });
    expect(await balanceOf(players[0], new Date('2026-11-17T20:00:01Z'))).toMatchObject({
      available: 20,
      pending: 0,
    });
  });

  describe('anti-abus', () => {
    it('plafond de 1 h 30 de jeu crédité par jour, tous clubs confondus', async () => {
      addBooking('matin', '2026-11-10T09:00', '2026-11-10T10:00', { participants: [1] }); // 60 min
      addBooking('midi', '2026-11-10T12:00', '2026-11-10T13:30', { participants: [1] }); // 90 min → 30 créditées
      addBooking('soir', '2026-11-10T19:00', '2026-11-10T20:30', { participants: [1] }); // plafond atteint
      addBooking('lendemain', '2026-11-11T19:00', '2026-11-11T20:30', { participants: [1] }); // nouveau jour
      await sync.syncClub(club.id, { now: NOW });
      const earns = await prisma.ledgerEntry.findMany({
        where: { userId: players[0].id, type: 'EARN' },
        orderBy: { earnedAt: 'asc' },
      });
      expect(earns.map((e) => e.amount)).toEqual([20, 10, 30]);
      await sync.syncClub(club.id, { now: NOW }); // relance : rien de plus
      expect(
        await prisma.ledgerEntry.count({ where: { userId: players[0].id, type: 'EARN' } }),
      ).toBe(3);
    });

    it('inscrit sur deux parties en même temps : le temps n’est compté qu’une fois', async () => {
      addBooking('t1', '2026-11-12T18:00', '2026-11-12T19:00', { participants: [1, 2] });
      addBooking('t2', '2026-11-12T18:00', '2026-11-12T19:00', { participants: [1, 3] });
      await sync.syncClub(club.id, { now: NOW });
      expect((await balanceOf(players[0])).available).toBe(20);
      expect((await balanceOf(players[1])).available).toBe(20);
      expect((await balanceOf(players[2])).available).toBe(20);
    });

    it('le club remplace un joueur par un autre : les points suivent', async () => {
      const id = addBooking('swap', '2026-11-13T18:00', '2026-11-13T19:30', {
        participants: [1, 2],
      });
      await sync.syncClub(club.id, { now: NOW });
      expect((await balanceOf(players[1])).available).toBe(30);

      fake.participants[id] = [{ externalPlayerId: extId(1) }, { externalPlayerId: extId(3) }]; // p2 → p3
      await sync.syncClub(club.id, { now: NOW });
      expect((await balanceOf(players[1])).available).toBe(0);
      expect((await balanceOf(players[2])).available).toBe(30);
      expect((await balanceOf(players[0])).available).toBe(30);

      // Réintégré ensuite : recrédité une seule fois
      fake.participants[id] = [{ externalPlayerId: extId(1) }, { externalPlayerId: extId(2) }];
      await sync.syncClub(club.id, { now: NOW });
      await sync.syncClub(club.id, { now: NOW });
      expect((await balanceOf(players[1])).available).toBe(30);
      expect((await balanceOf(players[2])).available).toBe(0);
    });
  });

  describe('bonus heures creuses (×2, lun–ven, au prorata)', () => {
    it('écrit un gain et un bonus distincts quand le club a activé le bonus', async () => {
      await prisma.club.update({ where: { id: club.id }, data: { offPeakBonusEnabled: true } });
      addBooking('b1', '2026-11-10T11:00', '2026-11-10T12:30', { participants: [1] }); // à cheval
      await sync.syncClub(club.id, { now: NOW });
      const entries = await prisma.ledgerEntry.findMany({
        where: { userId: players[0].id },
        orderBy: { type: 'asc' },
      });
      expect(entries.map((e) => [e.type, e.amount])).toEqual([
        ['EARN', 30],
        ['BONUS', 20],
      ]);
      expect(entries.every((e) => e.ruleSetVersion !== null)).toBe(true);
    });

    it('aucun bonus si le club ne l’a pas activé', async () => {
      addBooking('b1', '2026-11-10T10:00', '2026-11-10T11:00', { participants: [1] });
      await sync.syncClub(club.id, { now: NOW });
      expect((await balanceOf(players[0])).available).toBe(20);
    });

    it('aucun bonus le week-end', async () => {
      await prisma.club.update({ where: { id: club.id }, data: { offPeakBonusEnabled: true } });
      addBooking('b1', '2026-11-14T10:00', '2026-11-14T11:00', { participants: [1] });
      await sync.syncClub(club.id, { now: NOW });
      expect((await balanceOf(players[0])).available).toBe(20);
    });
  });

  it('pas de rétroactivité : une partie jouée avant la liaison du compte ne rapporte rien', async () => {
    await prisma.playerExternalLink.updateMany({
      where: { userId: players[1].id },
      data: { linkedAt: new Date('2026-11-12T00:00:00Z') },
    });
    addBooking('avant', '2026-11-10T18:00', '2026-11-10T19:00', { participants: [2] });
    addBooking('apres', '2026-11-13T18:00', '2026-11-13T19:00', { participants: [2] });
    await sync.syncClub(club.id, { now: NOW });
    expect((await balanceOf(players[1])).available).toBe(20);
  });

  it('un compte anonymisé (RGPD) n’est plus crédité', async () => {
    await prisma.user.update({ where: { id: players[3].id }, data: { anonymizedAt: new Date() } });
    addBooking('b1', '2026-11-10T18:00', '2026-11-10T19:00', { participants: [1, 4] });
    await sync.syncClub(club.id, { now: NOW });
    expect(await prisma.ledgerEntry.count({ where: { userId: players[3].id } })).toBe(0);
  });

  it('en cas d’erreur du fournisseur : synchro FAILED, journalisée, et période relue ensuite', async () => {
    fake.failWith = 'API indisponible';
    const res = await sync.syncClub(club.id, { now: NOW });
    expect(res.status).toBe('FAILED');
    const cfg = await prisma.clubConnectorConfig.findUniqueOrThrow({ where: { clubId: club.id } });
    expect(cfg).toMatchObject({
      lastSyncStatus: 'FAILED',
      lastSyncError: 'API indisponible',
      lastSyncAt: null,
    });

    fake.failWith = null;
    addBooking('b1', '2026-11-10T18:00', '2026-11-10T19:00', { participants: [1] });
    expect((await sync.syncClub(club.id, { now: NOW })).status).toBe('SUCCESS');
    expect((await balanceOf(players[0])).available).toBe(20);
  });

  describe('expiration (12 mois, FIFO)', () => {
    it('expire les points non dépensés 12 mois après le gain, une seule fois', async () => {
      addBooking('ancien', '2025-10-01T18:00', '2025-10-01T19:00', { participants: [1] });
      addBooking('recent', '2026-11-10T18:00', '2026-11-10T19:00', { participants: [1] });
      await sync.syncClub(club.id, { now: NOW });

      await ledger.runExpirations(NOW);
      await ledger.runExpirations(NOW);

      const expired = await prisma.ledgerEntry.findMany({
        where: { userId: players[0].id, type: 'EXPIRE' },
      });
      expect(expired.map((e) => e.amount)).toEqual([-20]);
      expect((await balanceOf(players[0])).available).toBe(20);
    });
  });

  describe('API', () => {
    it('le joueur consulte son solde et son historique', async () => {
      addBooking('b1', '2026-11-10T18:00', '2026-11-10T19:30', { participants: [1] });
      await sync.syncClub(club.id, { now: NOW });
      const { accessToken } = await login(app, mail, players[0].email, 'MOBILE');
      const auth = { Authorization: `Bearer ${accessToken}` };

      const bal = await request(app.getHttpServer()).get('/me/balance').set(auth).expect(200);
      expect(bal.body).toMatchObject({ available: 30, pending: 0 });

      const tx = await request(app.getHttpServer()).get('/me/transactions').set(auth).expect(200);
      expect(tx.body.items[0]).toMatchObject({
        type: 'EARN',
        label: 'Partie jouée',
        amount: 30,
        status: 'VALIDATED',
      });
      expect(tx.body.items[0].club.id).toBe(club.id);
    });

    it('seul le super admin peut relancer une synchro', async () => {
      const admin = await createUser(prisma, Role.CLUB_ADMIN, club.id);
      const sa = await createUser(prisma, Role.SUPER_ADMIN);
      const adminTok = (await login(app, mail, admin.email, 'ADMIN')).accessToken;
      const saTok = (await login(app, mail, sa.email, 'ADMIN')).accessToken;

      await request(app.getHttpServer())
        .post(`/clubs/${club.id}/sync`)
        .set({ Authorization: `Bearer ${adminTok}` })
        .expect(403);
      const res = await request(app.getHttpServer())
        .post(`/clubs/${club.id}/sync`)
        .set({ Authorization: `Bearer ${saTok}` })
        .expect(201);
      expect(res.body.status).toBe('SUCCESS');
      const runs = await request(app.getHttpServer())
        .get(`/clubs/${club.id}/sync-runs`)
        .set({ Authorization: `Bearer ${saTok}` })
        .expect(200);
      expect(runs.body[0]).toMatchObject({ status: 'SUCCESS', triggeredById: sa.id });
    });
  });
});
