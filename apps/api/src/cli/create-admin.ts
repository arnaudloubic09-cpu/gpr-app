/**
 * Crée le premier compte super admin (une seule fois, à l'installation).
 *   node dist/cli/create-admin.js prenom.nom@exemple.fr Prénom Nom
 * Les comptes suivants se créent depuis le back-office (Comptes admin).
 */
import { PrismaClient, Role } from '@prisma/client';
import { emailSchema } from '@gpr/core';

async function main() {
  const [rawEmail, firstName = 'Admin', lastName = 'GPR'] = process.argv.slice(2);
  const parsed = emailSchema.safeParse(rawEmail ?? '');
  if (!parsed.success) {
    console.error('Usage : node dist/cli/create-admin.js email [prénom] [nom]');
    process.exit(1);
  }
  const email = parsed.data;
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing?.role === Role.SUPER_ADMIN) {
      console.log(`Le super admin ${email} existe déjà.`);
      return;
    }
    if (existing) {
      console.error(
        `${email} est déjà utilisé par un compte ${existing.role} (les comptes sont séparés).`,
      );
      process.exitCode = 1;
      return;
    }
    await prisma.user.create({ data: { email, firstName, lastName, role: Role.SUPER_ADMIN } });
    console.log(
      `Super admin créé : ${email}. Connexion au back-office avec cet email (code envoyé par email).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}
void main();
