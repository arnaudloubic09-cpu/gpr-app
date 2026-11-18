/**
 * Préproduction : aligne le catalogue des clubs de DÉMONSTRATION sur le catalogue type GPR
 * (masque les anciennes récompenses de démo, ajoute celles qui manquent). Idempotent.
 *   node dist/cli/demo-catalog.js
 */
import { PrismaClient } from '@prisma/client';
import { STANDARD_CATALOG } from '@gpr/core';

const DEMO_CLUBS = ['padel-arena-toulouse', 'smash-club-bordeaux'];

async function main() {
  const prisma = new PrismaClient();
  try {
    const titles = STANDARD_CATALOG.map((r) => r.title);
    for (const slug of DEMO_CLUBS) {
      const club = await prisma.club.findUnique({ where: { slug } });
      if (!club) continue;
      await prisma.reward.updateMany({
        where: { clubId: club.id, title: { notIn: titles } },
        data: { isActive: false },
      });
      const existing = await prisma.reward.findMany({
        where: { clubId: club.id, title: { in: titles } },
      });
      for (const r of STANDARD_CATALOG) {
        const found = existing.find((e) => e.title === r.title);
        if (found)
          await prisma.reward.update({ where: { id: found.id }, data: { ...r, isActive: true } });
        else await prisma.reward.create({ data: { ...r, clubId: club.id } });
      }
      console.log(`Catalogue type appliqué : ${club.name}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
void main();
