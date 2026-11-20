import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { Club, PrismaClient, Role, User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { TokenService } from '../src/auth/token.service';
import { PartnerPortalService } from '../src/club-content/partner-portal.service';
import { CapturingMailService, createClub, createTestApp, createUser } from './helpers';

// PNG 1×1 valide
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('Info du moment et partenaires locaux (intégration)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let moduleRef: TestingModule;
  let mail: CapturingMailService;
  const http = () => request(app.getHttpServer());
  const as = async (u: User) => ({
    Authorization: `Bearer ${(await moduleRef.get(TokenService).issue(u)).accessToken}`,
  });
  const hours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

  beforeAll(async () => {
    ({ app, moduleRef, mail } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  let club: Club;
  let other: Club;
  let admin: User;
  beforeEach(async () => {
    club = await createClub(prisma, 'Club Info');
    other = await createClub(prisma, 'Club Voisin');
    admin = await createUser(prisma, Role.CLUB_ADMIN, club.id);
  });
  const player = (favoriteClubId: string | null) =>
    prisma.user.create({
      data: { email: `${randomUUID()}@t.example`, firstName: 'Zoé', favoriteClubId },
    });

  describe('info du moment', () => {
    it('visible par les joueurs dont c’est le club principal, pendant sa période ; statistiques d’affichage', async () => {
      const h = await as(admin);
      await http()
        .post(`/clubs/${club.id}/admin/announcements`)
        .set(h)
        .send({
          title: 'Tournoi samedi',
          body: 'Inscriptions ouvertes à l’accueil.',
          startsAt: hours(-1),
          endsAt: hours(24),
        })
        .expect(201);
      const fan = await player(club.id);
      await player(other.id);
      const aud = await http()
        .get(`/clubs/${club.id}/admin/announcements/audience`)
        .set(h)
        .expect(200);
      expect(aud.body).toEqual({ players: 1 });
      const res = await http()
        .get('/me/announcement')
        .set(await as(fan))
        .expect(200);
      expect(res.body.announcement).toMatchObject({
        title: 'Tournoi samedi',
        club: { id: club.id },
      });
      await http()
        .get('/me/announcement')
        .set(await as(fan))
        .expect(200);
      expect(
        (
          await http()
            .get('/me/announcement')
            .set(await as(await player(other.id)))
        ).body.announcement,
      ).toBeNull();
      expect(
        (
          await http()
            .get('/me/announcement')
            .set(await as(await player(null)))
        ).body.announcement,
      ).toBeNull();

      const list = await http().get(`/clubs/${club.id}/admin/announcements`).set(h).expect(200);
      expect(list.body[0].stats).toEqual({ players: 1, views: 2 });
    });

    it('une seule info à la fois (la plus récente) ; ni passée ni future', async () => {
      const h = await as(admin);
      await http()
        .post(`/clubs/${club.id}/admin/announcements`)
        .set(h)
        .send({
          title: 'Ancienne info',
          body: 'Terminée hier.',
          startsAt: hours(-48),
          endsAt: hours(-24),
        })
        .expect(201);
      await http()
        .post(`/clubs/${club.id}/admin/announcements`)
        .set(h)
        .send({
          title: 'Info A',
          body: 'Première info en cours.',
          startsAt: hours(-5),
          endsAt: hours(24),
        })
        .expect(201);
      await http()
        .post(`/clubs/${club.id}/admin/announcements`)
        .set(h)
        .send({
          title: 'Info B',
          body: 'Seconde info en cours.',
          startsAt: hours(-1),
          endsAt: hours(24),
        })
        .expect(201);
      await http()
        .post(`/clubs/${club.id}/admin/announcements`)
        .set(h)
        .send({
          title: 'Info future',
          body: 'La semaine prochaine.',
          startsAt: hours(100),
          endsAt: hours(200),
        })
        .expect(201);
      expect(
        (
          await http()
            .get('/me/announcement')
            .set(await as(await player(club.id)))
        ).body.announcement.title,
      ).toBe('Info B');
    });

    it('période invalide refusée ; un club ne publie pas pour un autre', async () => {
      const h = await as(admin);
      await http()
        .post(`/clubs/${club.id}/admin/announcements`)
        .set(h)
        .send({ title: 'Erreur', body: 'Fin avant début.', startsAt: hours(5), endsAt: hours(1) })
        .expect(400);
      await http()
        .post(`/clubs/${other.id}/admin/announcements`)
        .set(h)
        .send({ title: 'Intrusion', body: 'Pas mon club.', startsAt: hours(-1), endsAt: hours(5) })
        .expect(403);
    });
  });

  describe('partenaires locaux', () => {
    const body = {
      name: 'Le Bistrot du Padel',
      offer: '-10 % sur l’addition',
      address: '12 rue des Lilas, 31000 Toulouse',
    };

    it('création avec logo (servi publiquement) ; fichier non image refusé', async () => {
      const h = await as(admin);
      const res = await http()
        .post(`/clubs/${club.id}/admin/local-partners`)
        .set(h)
        .send({ ...body, logo: PNG })
        .expect(201);
      expect(res.body.logoUrl).toMatch(/^\/local-partners\/.+\/logo\?v=\d+$/);
      expect(res.body.mapsUrl).toContain('google.com/maps/search');
      const logo = await http().get(res.body.logoUrl).expect(200);
      expect(logo.headers['content-type']).toBe('image/png');

      const fake = `data:image/png;base64,${Buffer.from('ceci n’est pas une image').toString('base64')}`;
      await http()
        .post(`/clubs/${club.id}/admin/local-partners`)
        .set(h)
        .send({ ...body, logo: fake })
        .expect(400);
      await http().post(`/clubs/${other.id}/admin/local-partners`).set(h).send(body).expect(403);
    });

    it('tous les joueurs voient tous les partenaires, ceux du club principal en premier ; avantage actif après une partie dans CE club depuis moins de 30 jours', async () => {
      await http()
        .post(`/clubs/${club.id}/admin/local-partners`)
        .set(await as(admin))
        .send(body)
        .expect(201);
      const otherAdmin = await createUser(prisma, Role.CLUB_ADMIN, other.id);
      await http()
        .post(`/clubs/${other.id}/admin/local-partners`)
        .set(await as(otherAdmin))
        .send({ ...body, name: 'Kiné du Voisin' })
        .expect(201);

      const p = await player(other.id);
      const earn = async (clubId: string, daysAgo: number) => {
        const t = new Date(Date.now() - daysAgo * 86_400_000);
        await prisma.ledgerEntry.create({
          data: {
            userId: p.id,
            type: 'EARN',
            amount: 30,
            sourceType: 'BOOKING',
            sourceId: randomUUID(),
            clubId,
            idempotencyKey: `t:${randomUUID()}`,
            earnedAt: t,
            availableAt: t,
          },
        });
      };
      await earn(club.id, 5); // a joué au Club Info il y a 5 jours
      await earn(other.id, 40); // et au Club Voisin il y a 40 jours

      const res = await http()
        .get('/me/local-partners')
        .set(await as(p))
        .expect(200);
      const mine = res.body.filter((x: { clubId: string }) =>
        [club.id, other.id].includes(x.clubId),
      );
      expect(mine[0]).toMatchObject({ name: 'Kiné du Voisin', favorite: true, active: false });
      expect(mine[1]).toMatchObject({ name: 'Le Bistrot du Padel', favorite: false, active: true });
      expect(Math.round((new Date(mine[1].activeUntil).getTime() - Date.now()) / 86_400_000)).toBe(
        25,
      );
    });
  });

  describe('logo du club', () => {
    it('l’admin dépose le logo de son club, visible publiquement ; pas celui d’un autre club', async () => {
      const h = await as(admin);
      const res = await http().put(`/clubs/${club.id}/logo`).set(h).send({ logo: PNG }).expect(200);
      expect(res.body.logoUrl).toMatch(new RegExp(`^/clubs/${club.id}/logo\\?v=`));
      const [mine] = (await http().get('/clubs').set(h).expect(200)).body;
      expect(mine.logoUrl).toBe(res.body.logoUrl);
      const img = await http().get(`/clubs/${club.id}/logo`).expect(200);
      expect(img.headers['content-type']).toBe('image/png');
      await http().put(`/clubs/${other.id}/logo`).set(h).send({ logo: PNG }).expect(403);
      await http()
        .put(`/clubs/${club.id}/logo`)
        .set(h)
        .send({ logo: 'data:image/png;base64,' + Buffer.from('pas une image').toString('base64') })
        .expect(400);
      await http().put(`/clubs/${club.id}/logo`).set(h).send({ logo: null }).expect(200);
      await http().get(`/clubs/${club.id}/logo`).expect(404);
    });
  });

  describe('suivi des avantages chez les partenaires locaux', () => {
    const playIn = async (u: User, clubId: string) => {
      const t = new Date(Date.now() - 86_400_000);
      await prisma.ledgerEntry.create({
        data: {
          userId: u.id,
          type: 'EARN',
          amount: 30,
          sourceType: 'BOOKING',
          sourceId: randomUUID(),
          clubId,
          idempotencyKey: `t:${randomUUID()}`,
          earnedAt: t,
          availableAt: t,
        },
      });
    };
    async function setup() {
      const h = await as(admin);
      const created = await http()
        .post(`/clubs/${club.id}/admin/local-partners`)
        .set(h)
        .send({
          name: 'Le Bistrot',
          offer: '-10 % sur l’addition',
          address: '1 place du Capitole, Toulouse',
          email: 'bistrot@t.example',
        })
        .expect(201);
      const [row] = (await http().get(`/clubs/${club.id}/admin/local-partners`).set(h).expect(200))
        .body;
      const portal = { 'x-partner-token': row.portalUrl.split('/partenaire/acces/')[1] as string };
      const zoe = await prisma.user.create({
        data: { email: `${randomUUID()}@t.example`, firstName: 'Zoé', lastName: 'martin' },
      });
      return { partnerId: created.body.id as string, row, portal, zoe };
    }

    it('QR code réservé aux joueurs actifs dans le club ; le partenaire le scanne et valide une seule fois', async () => {
      const { partnerId, row, portal, zoe } = await setup();
      expect(row).toMatchObject({ email: 'bistrot@t.example', stats: { thisMonth: 0, total: 0 } });
      const hz = await as(zoe);
      await http().post(`/me/local-partners/${partnerId}/use`).set(hz).expect(403);

      await playIn(zoe, club.id);
      const use = (await http().post(`/me/local-partners/${partnerId}/use`).set(hz).expect(201))
        .body;
      expect(use.url).toMatch(/\/partenaire\/valider\?t=/);
      expect(
        (await http().get(`/me/local-partner-uses/${use.token}`).set(hz).expect(200)).body.status,
      ).toBe('PENDING');

      // Sans lien partenaire : refusé
      await http().get(`/partner-portal/uses/${use.token}`).expect(401);
      const preview = await http().get(`/partner-portal/uses/${use.token}`).set(portal).expect(200);
      expect(preview.body).toMatchObject({ status: 'VALID', player: 'Zoé M.' });

      // Deux scans simultanés : une seule validation
      const results = await Promise.all([
        http().post(`/partner-portal/uses/${use.token}`).set(portal),
        http().post(`/partner-portal/uses/${use.token}`).set(portal),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 410]);
      expect(
        (await http().get(`/me/local-partner-uses/${use.token}`).set(hz).expect(200)).body.status,
      ).toBe('USED');

      // Suivi : partenaire, club, GPR
      const me = (await http().get('/partner-portal').set(portal).expect(200)).body;
      expect(me.stats).toEqual({ thisMonth: 1, lastMonth: 0, total: 1 });
      expect(me.recent[0].player).toBe('Zoé M.');
      const [after] = (
        await http()
          .get(`/clubs/${club.id}/admin/local-partners`)
          .set(await as(admin))
          .expect(200)
      ).body;
      expect(after.stats.total).toBe(1);
      const sa = await createUser(prisma, Role.SUPER_ADMIN);
      const all = (
        await http()
          .get('/admin/local-partners')
          .set(await as(sa))
          .expect(200)
      ).body;
      expect(all.find((p: { id: string }) => p.id === partnerId).stats.thisMonth).toBe(1);
      await http()
        .get('/admin/local-partners')
        .set(await as(admin))
        .expect(403);
    });

    it('QR code expiré ou d’un autre partenaire refusé ; nouveau lien : l’ancien ne marche plus', async () => {
      const { partnerId, portal, zoe } = await setup();
      await playIn(zoe, club.id);
      const hz = await as(zoe);
      const use = (await http().post(`/me/local-partners/${partnerId}/use`).set(hz).expect(201))
        .body;

      const otherPartner = await prisma.localPartner.create({
        data: {
          clubId: club.id,
          name: 'Kiné',
          offer: '-5 €',
          address: 'Toulouse',
          portalToken: randomUUID(),
        },
      });
      await http()
        .get(`/partner-portal/uses/${use.token}`)
        .set({ 'x-partner-token': otherPartner.portalToken })
        .expect(403);

      await prisma.localPartnerUse.updateMany({
        where: { partnerId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await http().post(`/partner-portal/uses/${use.token}`).set(portal).expect(410);

      const regen = await http()
        .post(`/clubs/${club.id}/admin/local-partners/${partnerId}/portal-link`)
        .set(await as(admin))
        .expect(201);
      expect(regen.body.portalUrl).not.toContain(portal['x-partner-token']);
      await http().get('/partner-portal').set(portal).expect(401);
    });

    it('récapitulatif mensuel envoyé par email au partenaire', async () => {
      const { partnerId, portal, zoe } = await setup();
      await playIn(zoe, club.id);
      const use = (
        await http()
          .post(`/me/local-partners/${partnerId}/use`)
          .set(await as(zoe))
          .expect(201)
      ).body;
      await http().post(`/partner-portal/uses/${use.token}`).set(portal).expect(200);
      const nextMonth = new Date();
      nextMonth.setUTCDate(15);
      nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
      mail.alerts.length = 0;
      await moduleRef.get(PartnerPortalService).monthlyReports(nextMonth);
      const m = mail.alerts.find((a) => a.to.includes('bistrot@t.example'));
      expect(m?.subject).toContain('1 utilisation');
      expect(m?.text).toContain('/partenaire/acces/');
    });
  });
});
