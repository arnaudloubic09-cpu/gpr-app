import { PrismaClient, Role } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { createClub, createUser } from './helpers';

/** Garanties portées par la base elle-même (triggers + contraintes CHECK). */
describe('Intégrité de la base de données', () => {
  const prisma = new PrismaClient();
  afterAll(() => prisma.$disconnect());

  const now = new Date();
  const entry = (userId: string, over: Record<string, unknown> = {}) => ({
    userId,
    type: 'EARN' as const,
    amount: 10,
    sourceType: 'BOOKING' as const,
    sourceId: randomUUID(),
    idempotencyKey: `booking:${randomUUID()}`,
    earnedAt: now,
    availableAt: now,
    ...over,
  });

  describe('ledger immuable', () => {
    it('interdit la modification et la suppression d’une écriture', async () => {
      const user = await createUser(prisma, Role.PLAYER);
      const e = await prisma.ledgerEntry.create({ data: entry(user.id) });
      await expect(
        prisma.ledgerEntry.update({ where: { id: e.id }, data: { amount: 1000 } }),
      ).rejects.toThrow(/immuable/);
      await expect(prisma.ledgerEntry.delete({ where: { id: e.id } })).rejects.toThrow(/immuable/);
      await expect(prisma.$executeRawUnsafe('TRUNCATE "LedgerEntry" CASCADE')).rejects.toThrow(
        /immuable/,
      );
    });

    it('refuse deux écritures avec la même clé d’idempotence', async () => {
      const user = await createUser(prisma, Role.PLAYER);
      const key = `booking:${randomUUID()}`;
      await prisma.ledgerEntry.create({ data: entry(user.id, { idempotencyKey: key }) });
      await expect(
        prisma.ledgerEntry.create({ data: entry(user.id, { idempotencyKey: key }) }),
      ).rejects.toThrow();
    });

    it('impose le signe selon le type et un motif + auteur pour un ajustement', async () => {
      const user = await createUser(prisma, Role.PLAYER);
      await expect(
        prisma.ledgerEntry.create({ data: entry(user.id, { amount: -10 }) }),
      ).rejects.toThrow();
      await expect(
        prisma.ledgerEntry.create({
          data: entry(user.id, { type: 'REDEEM', sourceType: 'REDEMPTION', amount: 50 }),
        }),
      ).rejects.toThrow();
      await expect(
        prisma.ledgerEntry.create({
          data: entry(user.id, { type: 'ADJUST', sourceType: 'MANUAL', amount: 20 }),
        }),
      ).rejects.toThrow();
      const admin = await createUser(prisma, Role.SUPER_ADMIN);
      await expect(
        prisma.ledgerEntry.create({
          data: entry(user.id, {
            type: 'ADJUST',
            sourceType: 'MANUAL',
            amount: -20,
            reason: 'Geste commercial annulé',
            authorId: admin.id,
          }),
        }),
      ).resolves.toBeDefined();
    });
  });

  it('le journal d’audit est immuable', async () => {
    const log = await prisma.auditLog.create({ data: { action: 'test', entityType: 'Test' } });
    await expect(prisma.auditLog.delete({ where: { id: log.id } })).rejects.toThrow(/immuable/);
  });

  describe('récompenses', () => {
    it('refuse une catégorie « réservation / partie de padel » (absente de l’enum)', async () => {
      const club = await createClub(prisma);
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "Reward" (id, "clubId", category, kind, title, "costGpr", "updatedAt")
           VALUES (gen_random_uuid(), $1::uuid, 'BOOKING', 'FREE_ITEM', 'Partie offerte', 100, now())`,
          club.id,
        ),
      ).rejects.toThrow();
    });

    it('refuse un cours gratuit, accepte une réduction sur un cours', async () => {
      const club = await createClub(prisma);
      await expect(
        prisma.reward.create({
          data: {
            clubId: club.id,
            category: 'LESSON',
            kind: 'FREE_ITEM',
            title: 'Cours offert',
            costGpr: 200,
          },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.reward.create({
          data: {
            clubId: club.id,
            category: 'LESSON',
            kind: 'DISCOUNT_PERCENT',
            discountValue: 20,
            title: '-20 % cours',
            costGpr: 200,
          },
        }),
      ).resolves.toBeDefined();
    });

    it('refuse un coût nul et un pourcentage hors bornes', async () => {
      const club = await createClub(prisma);
      await expect(
        prisma.reward.create({
          data: { clubId: club.id, category: 'DRINK', kind: 'FREE_ITEM', title: 'x', costGpr: 0 },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.reward.create({
          data: {
            clubId: club.id,
            category: 'EQUIPMENT',
            kind: 'DISCOUNT_PERCENT',
            discountValue: 120,
            title: 'x',
            costGpr: 10,
          },
        }),
      ).rejects.toThrow();
    });
  });

  it('un admin club doit être rattaché à un club, un joueur ne l’est jamais', async () => {
    const club = await createClub(prisma);
    await expect(
      prisma.user.create({ data: { email: `${randomUUID()}@t.example`, role: 'CLUB_ADMIN' } }),
    ).rejects.toThrow();
    await expect(
      prisma.user.create({
        data: { email: `${randomUUID()}@t.example`, role: 'PLAYER', clubId: club.id },
      }),
    ).rejects.toThrow();
  });
});
