/**
 * Lance une tâche planifiée à la demande (exploitation, démo, reprise après incident).
 *
 *   pnpm --filter @gpr/api job gamification [--from=2026-09-01]   (développement)
 *   node dist/cli/run-job.js gamification                            (production)
 *   pnpm --filter @gpr/api job expire | coupons-expire | gdpr-deletions
 */
import './no-jobs';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { GamificationService } from '../gamification/gamification.service';
import { GdprService } from '../gamification/gdpr.service';
import { LedgerService } from '../ledger/ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import { CouponsService } from '../rewards/coupons.service';
import { VipService } from '../vip/vip.service';

async function main() {
  const [job, ...args] = process.argv.slice(2);
  const from = args.find((a) => a.startsWith('--from='))?.slice(7);
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  try {
    switch (job) {
      case 'gamification':
        if (from) {
          await app.get(PrismaService).jobState.upsert({
            where: { key: 'gamification.watermark' },
            create: { key: 'gamification.watermark', value: new Date(from).toISOString() },
            update: { value: new Date(from).toISOString() },
          });
        }
        console.log(await app.get(GamificationService).run());
        break;
      case 'expire':
        console.log(await app.get(LedgerService).runExpirations());
        break;
      case 'coupons-expire':
        await app.get(GamificationService).couponReminders();
        console.log({ refunded: await app.get(CouponsService).expireDue() });
        break;
      case 'vip':
        console.log({ granted: await app.get(VipService).refreshGamesMemberships() });
        break;
      case 'gdpr-deletions':
        console.log({ anonymized: await app.get(GdprService).runDueDeletions() });
        break;
      default:
        console.error(
          'Tâche inconnue. Valeurs : gamification, expire, coupons-expire, gdpr-deletions',
        );
        process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}
void main();
