/**
 * Données de démonstration : 2 clubs fictifs, 1 super admin, 1 admin par club, 30 joueurs,
 * règles GPR par défaut, catalogue de récompenses, badges et défis d'exemple.
 * Idempotent (upserts) : peut être relancé sans dupliquer les données.
 * Les réservations simulées sont produites par le MockConnector.
 *
 *   développement : pnpm db:seed          production / préproduction : node dist/cli/seed.js
 */
import { faker } from '@faker-js/faker/locale/fr';
import { Prisma, PrismaClient, Role } from '@prisma/client';
import { DEFAULT_GPR_RULES, STANDARD_CATALOG, validateRewardConfig } from '@gpr/core';
import { CryptoService } from '../common/crypto/crypto.service';

const prisma = new PrismaClient();
const crypto = new CryptoService({ get: () => process.env.CONNECTOR_ENCRYPTION_KEY } as never);

faker.seed(2026); // données reproductibles

const CLUBS = [
  {
    slug: 'padel-arena-toulouse',
    name: 'Padel Arena Toulouse',
    city: 'Toulouse',
    offPeakBonusEnabled: true,
    externalClubId: 'mock-playtomic-tls-001',
    adminEmail: 'admin.toulouse@gpr.example',
  },
  {
    slug: 'smash-club-bordeaux',
    name: 'Smash Club Bordeaux',
    city: 'Bordeaux',
    offPeakBonusEnabled: false,
    externalClubId: 'mock-doinsport-bdx-001',
    adminEmail: 'admin.bordeaux@gpr.example',
  },
] as const;

type RewardSeed = Omit<Prisma.RewardUncheckedCreateInput, 'clubId'>;

// Catalogue type GPR pour les deux clubs de démonstration
const REWARDS: Record<(typeof CLUBS)[number]['slug'], RewardSeed[]> = {
  'padel-arena-toulouse': STANDARD_CATALOG,
  'smash-club-bordeaux': STANDARD_CATALOG,
};

async function main() {
  // ── Règles GPR globales (version 1) ──
  const r = DEFAULT_GPR_RULES;
  // La version 1 reflète toujours les valeurs par défaut validées (avant mise en production).
  // Ensuite, toute modification passera par une nouvelle version créée par le super admin.
  const ruleData = {
    pointsPerSlot: r.pointsPerSlot,
    slotMinutes: r.slotMinutes,
    dailyCapPerPlayer: r.dailyCapPerPlayer,
    dailyMaxMinutes: r.dailyMaxMinutes,
    pendingDelayMinutes: r.pendingDelayMinutes,
    expirationMonths: r.expirationMonths,
    couponValidityDays: r.couponValidityDays,
    offPeakMultiplier: r.offPeakMultiplier,
    offPeakWindows: r.offPeakWindows as unknown as Prisma.InputJsonValue,
    levels: r.levels as unknown as Prisma.InputJsonValue,
  };
  await prisma.ruleSet.upsert({
    where: { version: 1 },
    update: ruleData,
    create: { version: 1, ...ruleData },
  });

  // ── Super admin ──
  await prisma.user.upsert({
    where: { email: 'superadmin@gpr.example' },
    update: {},
    create: {
      email: 'superadmin@gpr.example',
      firstName: 'Super',
      lastName: 'Admin',
      role: Role.SUPER_ADMIN,
    },
  });

  // ── Clubs, connecteurs simulés, admins, catalogue ──
  const clubIds: string[] = [];
  for (const c of CLUBS) {
    const club = await prisma.club.upsert({
      where: { slug: c.slug },
      update: {},
      create: {
        slug: c.slug,
        name: c.name,
        city: c.city,
        offPeakBonusEnabled: c.offPeakBonusEnabled,
      },
    });
    clubIds.push(club.id);

    await prisma.clubConnectorConfig.upsert({
      where: { clubId: club.id },
      update: {},
      create: {
        clubId: club.id,
        provider: 'MOCK',
        externalClubId: c.externalClubId,
        credentialsEncrypted: crypto.encryptJson({ apiKey: 'demo-not-a-real-key' }),
        syncIntervalMinutes: 30,
      },
    });

    await prisma.user.upsert({
      where: { email: c.adminEmail },
      update: {},
      create: {
        email: c.adminEmail,
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        role: Role.CLUB_ADMIN,
        clubId: club.id,
      },
    });

    const existing = await prisma.reward.count({ where: { clubId: club.id } });
    if (existing === 0) {
      for (const reward of REWARDS[c.slug]) {
        const errors = validateRewardConfig(reward);
        if (errors.length)
          throw new Error(`Récompense de démo invalide « ${reward.title} » : ${errors}`);
        await prisma.reward.create({ data: { ...reward, clubId: club.id } });
      }
    }
  }

  // ── Avantages de niveau (démo) : réductions permanentes en club ──
  const perksByClub: Record<
    string,
    {
      levelCode: string;
      category: 'EQUIPMENT' | 'TOURNAMENT' | 'DRINK';
      discountPercent: number;
      label: string;
    }[]
  > = {
    'padel-arena-toulouse': [
      {
        levelCode: 'SILVER',
        category: 'EQUIPMENT',
        discountPercent: 5,
        label: '-5 % sur le shop du club',
      },
      {
        levelCode: 'GOLD',
        category: 'EQUIPMENT',
        discountPercent: 10,
        label: '-10 % sur le shop du club',
      },
      {
        levelCode: 'GOLD',
        category: 'TOURNAMENT',
        discountPercent: 10,
        label: '-10 % sur les inscriptions aux tournois',
      },
      {
        levelCode: 'PLATINUM',
        category: 'EQUIPMENT',
        discountPercent: 15,
        label: '-15 % sur le shop du club',
      },
      {
        levelCode: 'PLATINUM',
        category: 'TOURNAMENT',
        discountPercent: 15,
        label: '-15 % sur les inscriptions aux tournois',
      },
    ],
    'smash-club-bordeaux': [
      { levelCode: 'SILVER', category: 'DRINK', discountPercent: 10, label: '-10 % au bar' },
      {
        levelCode: 'GOLD',
        category: 'TOURNAMENT',
        discountPercent: 10,
        label: '-10 % sur les tournois',
      },
    ],
  };
  for (const c of CLUBS) {
    const club = await prisma.club.findUniqueOrThrow({ where: { slug: c.slug } });
    if ((await prisma.levelPerk.count({ where: { clubId: club.id } })) === 0) {
      await prisma.levelPerk.createMany({
        data: perksByClub[c.slug].map((p) => ({ ...p, clubId: club.id })),
      });
    }
  }

  // ── 30 joueurs ──
  for (let i = 1; i <= 30; i++) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const email = `joueur${String(i).padStart(2, '0')}@gpr.example`;
    const player = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        firstName,
        lastName,
        phone: faker.helpers.replaceSymbols('+33 6 ## ## ## ##'),
        role: Role.PLAYER,
        favoriteClubId: clubIds[i % 2],
        consents: { create: { type: 'TERMS', granted: true } },
      },
    });
    // Liaison avec un compte simulé chez le fournisseur de réservation (utilisée par le MockConnector).
    await prisma.playerExternalLink.upsert({
      where: {
        provider_externalPlayerId: { provider: 'MOCK', externalPlayerId: `mock-player-${i}` },
      },
      update: { linkedAt: new Date(Date.now() - 120 * 86_400_000) },
      // Comptes liés il y a 120 jours : pas de rétroactivité, seules les parties jouées
      // après la liaison rapportent des points GPR.
      create: {
        userId: player.id,
        provider: 'MOCK',
        externalPlayerId: `mock-player-${i}`,
        linkedAt: new Date(Date.now() - 120 * 86_400_000),
      },
    });
  }

  // ── Badges & défis de démonstration (exécutés par le moteur en phase 5) ──
  const explorer = await prisma.badge.upsert({
    where: { code: 'EXPLORER' },
    update: {},
    create: {
      code: 'EXPLORER',
      name: 'Explorateur',
      description: 'A joué dans 2 clubs différents du groupement le même mois',
      icon: 'compass',
    },
  });
  const regular = await prisma.badge.upsert({
    where: { code: 'REGULAR' },
    update: {},
    create: {
      code: 'REGULAR',
      name: 'Régularité',
      description: '4 semaines consécutives avec au moins une partie',
      icon: 'calendar',
    },
  });

  if ((await prisma.challenge.count()) === 0) {
    const startsAt = new Date('2026-01-01T00:00:00Z');
    await prisma.challenge.createMany({
      data: [
        {
          name: 'Jouer 3 fois cette semaine',
          description: '3 parties dans la semaine',
          trigger: 'BOOKING_COMPLETED',
          condition: { type: 'COUNT', target: 3 },
          period: 'WEEK',
          startsAt,
          rewardGpr: 50,
        },
        {
          name: 'Explorateur',
          description: 'Jouer dans 2 clubs différents du groupement ce mois-ci',
          trigger: 'BOOKING_COMPLETED',
          condition: { type: 'DISTINCT_CLUBS', target: 2 },
          period: 'MONTH',
          startsAt,
          rewardBadgeId: explorer.id,
        },
        {
          name: 'Lundi matin heures creuses',
          description: 'Jouer un lundi matin en heures creuses',
          trigger: 'BOOKING_COMPLETED',
          condition: { type: 'MATCH', weekday: 1, before: '12:00', offPeak: true },
          period: 'WEEK',
          startsAt,
          rewardGpr: 20,
        },
        {
          name: 'Régularité',
          description: 'Série de 4 semaines consécutives avec au moins une partie',
          trigger: 'BOOKING_COMPLETED',
          condition: { type: 'WEEKLY_STREAK', target: 4 },
          period: 'FIXED',
          startsAt,
          rewardBadgeId: regular.id,
        },
      ],
    });
  }

  const counts = {
    clubs: await prisma.club.count(),
    players: await prisma.user.count({ where: { role: 'PLAYER' } }),
    admins: await prisma.user.count({ where: { role: { not: 'PLAYER' } } }),
    rewards: await prisma.reward.count(),
    challenges: await prisma.challenge.count(),
  };
  console.log('Seed terminé :', counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
