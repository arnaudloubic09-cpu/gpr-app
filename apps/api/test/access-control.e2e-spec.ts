import { INestApplication } from '@nestjs/common';
import { PrismaClient, Role } from '@prisma/client';
import request from 'supertest';
import { CapturingMailService, createClub, createTestApp, createUser, login } from './helpers';

describe('Contrôle d’accès par rôle et par club (intégration)', () => {
  let app: INestApplication;
  let mail: CapturingMailService;
  const prisma = new PrismaClient();
  const http = () => request(app.getHttpServer());
  let clubA: { id: string };
  let clubB: { id: string };
  let tokens: Record<'player' | 'adminA' | 'superAdmin', string>;

  beforeAll(async () => {
    ({ app, mail } = await createTestApp());
    clubA = await createClub(prisma, 'Club A');
    clubB = await createClub(prisma, 'Club B');
    await prisma.clubConnectorConfig.create({
      data: {
        clubId: clubA.id,
        provider: 'MOCK',
        externalClubId: 'ext-a',
        credentialsEncrypted: 'v1:secret',
      },
    });
    const player = await createUser(prisma, Role.PLAYER);
    const adminA = await createUser(prisma, Role.CLUB_ADMIN, clubA.id);
    const superAdmin = await createUser(prisma, Role.SUPER_ADMIN);
    tokens = {
      player: (await login(app, mail, player.email, 'MOBILE')).accessToken,
      adminA: (await login(app, mail, adminA.email, 'ADMIN')).accessToken,
      superAdmin: (await login(app, mail, superAdmin.email, 'ADMIN')).accessToken,
    };
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const as = (who: keyof typeof tokens) => ({ Authorization: `Bearer ${tokens[who]}` });

  it('un admin club ne liste que son club', async () => {
    const res = await http().get('/clubs').set(as('adminA')).expect(200);
    expect(res.body.map((c: { id: string }) => c.id)).toEqual([clubA.id]);
  });

  it('un admin club ne peut ni lire ni modifier un autre club', async () => {
    await http().get(`/clubs/${clubB.id}`).set(as('adminA')).expect(403);
    await http()
      .patch(`/clubs/${clubB.id}/settings`)
      .set(as('adminA'))
      .send({ offPeakBonusEnabled: true })
      .expect(403);
  });

  it('un admin club active le bonus heures creuses de son club, avec trace d’audit', async () => {
    const res = await http()
      .patch(`/clubs/${clubA.id}/settings`)
      .set(as('adminA'))
      .send({ offPeakBonusEnabled: true })
      .expect(200);
    expect(res.body.offPeakBonusEnabled).toBe(true);
    const audit = await prisma.auditLog.findFirst({
      where: { entityId: clubA.id, action: 'club.settings.update' },
    });
    expect(audit).toMatchObject({
      actorRole: 'CLUB_ADMIN',
      before: { offPeakBonusEnabled: false },
    });
  });

  it('refuse les champs non autorisés dans les paramètres club', async () => {
    await http()
      .patch(`/clubs/${clubA.id}/settings`)
      .set(as('adminA'))
      .send({ offPeakBonusEnabled: true, isActive: false })
      .expect(400);
  });

  it('un joueur ne peut pas accéder au détail admin d’un club', async () => {
    await http().get(`/clubs/${clubA.id}`).set(as('player')).expect(403);
    await http()
      .patch(`/clubs/${clubA.id}/settings`)
      .set(as('player'))
      .send({ offPeakBonusEnabled: true })
      .expect(403);
  });

  it('le super admin voit tous les clubs et l’état du connecteur, jamais les identifiants', async () => {
    const res = await http().get(`/clubs/${clubA.id}`).set(as('superAdmin')).expect(200);
    expect(res.body.connector).toMatchObject({ provider: 'MOCK', externalClubId: 'ext-a' });
    expect(JSON.stringify(res.body)).not.toContain('secret');
    await http().get(`/clubs/${clubB.id}`).set(as('superAdmin')).expect(200);
  });

  it('l’admin club ne voit pas la configuration du connecteur', async () => {
    const res = await http().get(`/clubs/${clubA.id}`).set(as('adminA')).expect(200);
    expect(res.body.connector).toBeUndefined();
  });
});
