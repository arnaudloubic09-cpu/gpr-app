import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { Club, PrismaClient, Role, User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { TokenService } from '../src/auth/token.service';
import { createClub, createTestApp, createUser } from './helpers';

// PNG 1×1 valide
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('Info du moment et partenaires locaux (intégration)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let moduleRef: TestingModule;
  const http = () => request(app.getHttpServer());
  const as = async (u: User) => ({
    Authorization: `Bearer ${(await moduleRef.get(TokenService).issue(u)).accessToken}`,
  });
  const hours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

  beforeAll(async () => {
    ({ app, moduleRef } = await createTestApp());
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
});
