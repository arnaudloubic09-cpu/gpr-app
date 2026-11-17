import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import type { Env } from '../config/env';
import { LedgerService } from '../ledger/ledger.service';
import { CouponsService } from '../rewards/coupons.service';
import { PrismaService } from '../prisma/prisma.service';
import { SyncService } from '../sync/sync.service';

const QUEUE = 'gpr';
type JobData = { clubId?: string };

/**
 * Tâches planifiées (BullMQ + Redis) :
 *  - synchronisation de chaque club selon sa fréquence (syncIntervalMinutes) ;
 *  - expiration quotidienne des points GPR (3 h 15, heure de Paris) ;
 *  - toutes les heures : coupons non utilisés arrivés à expiration → remboursement.
 * Désactivé quand JOBS_ENABLED=false (tests).
 */
@Injectable()
export class JobsService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(JobsService.name);
  private connection?: IORedis;
  private queue?: Queue<JobData>;
  private worker?: Worker<JobData>;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
    private readonly sync: SyncService,
    private readonly ledger: LedgerService,
    private readonly coupons: CouponsService,
  ) {}

  async onModuleInit() {
    if (!this.config.get('JOBS_ENABLED', { infer: true })) return;
    this.connection = new IORedis(this.config.get('REDIS_URL', { infer: true }), {
      maxRetriesPerRequest: null,
    });
    this.queue = new Queue<JobData>(QUEUE, { connection: this.connection });
    this.worker = new Worker<JobData>(QUEUE, (job) => this.process(job), {
      connection: this.connection,
      concurrency: 2,
    });
    this.worker.on('failed', (job, err) =>
      this.logger.error(`Tâche ${job?.name} en échec : ${err.message}`),
    );

    await this.queue.upsertJobScheduler(
      'expire',
      { pattern: '15 3 * * *', tz: 'Europe/Paris' },
      { name: 'expire' },
    );
    const clubs = await this.prisma.clubConnectorConfig.findMany({
      where: { club: { isActive: true } },
    });
    for (const c of clubs) await this.scheduleClub(c.clubId, c.syncIntervalMinutes);
    this.logger.log(`Planification active : ${clubs.length} club(s) + expiration quotidienne`);
  }

  /** (Re)programme la synchro d'un club — à rappeler quand sa fréquence change (phase 4). */
  async scheduleClub(clubId: string, intervalMinutes: number) {
    await this.queue?.upsertJobScheduler(
      `sync:${clubId}`,
      { every: intervalMinutes * 60_000 },
      { name: 'sync', data: { clubId } },
    );
  }

  async unscheduleClub(clubId: string) {
    await this.queue?.removeJobScheduler(`sync:${clubId}`);
  }

  private async process(job: Job<JobData>) {
    if (job.name === 'sync' && job.data.clubId) {
      const res = await this.sync.syncClub(job.data.clubId);
      if (res.status === 'FAILED') throw new Error(res.run.error ?? 'Synchronisation en échec');
      return res.status;
    }
    if (job.name === 'expire') return this.ledger.runExpirations();
    if (job.name === 'coupons-expire') return this.coupons.expireDue();
  }

  async onApplicationShutdown() {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit();
  }
}
