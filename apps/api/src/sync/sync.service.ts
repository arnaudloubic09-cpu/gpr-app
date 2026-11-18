import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BookingStatus, Club, ClubConnectorConfig, Prisma, SyncRun } from '@prisma/client';
import {
  addMonths,
  computeIntervalsPoints,
  creditableIntervals,
  Interval,
  localDayKey,
} from '@gpr/core';
import type {
  Booking as ExternalBooking,
  BookingConnector,
  ConnectorClubConfig,
} from '@gpr/connectors';
import type { Env } from '../config/env';
import { AnalyticsService } from '../common/analytics/analytics.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { MailService } from '../common/mail/mail.service';
import { ConnectorRegistry } from '../connectors/connector-registry';
import { PrismaService } from '../prisma/prisma.service';
import { ActiveRules, RulesService } from '../rules/rules.service';

const STALE_RUN_MS = 30 * 60_000;
/** Nombre d'échecs consécutifs déclenchant l'alerte email aux super admins. */
export const FAILURE_ALERT_THRESHOLD = 3;
const REVERSIBLE_STATUSES: BookingStatus[] = ['CANCELLED', 'NO_SHOW'];

export type SyncOutcome =
  { status: 'SKIPPED'; reason: 'ALREADY_RUNNING' } | { status: 'SUCCESS' | 'FAILED'; run: SyncRun };

interface Ctx {
  club: Club & { connector: ClubConnectorConfig };
  connector: BookingConnector;
  cfg: ConnectorClubConfig;
  rules: ActiveRules;
  now: Date;
}

/**
 * Synchronisation des réservations d'un club et crédit des points GPR.
 *
 * Idempotence (une réservation ne crédite jamais deux fois) :
 *  - réservation : clé unique (fournisseur, club, id externe) ;
 *  - écritures : clé unique `booking:<id>:user:<id>:earn|bonus` et `reversal:<écriture>` ;
 *  - une seule synchro à la fois par club (index unique partiel sur SyncRun RUNNING).
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ConnectorRegistry,
    private readonly rulesService: RulesService,
    private readonly crypto: CryptoService,
    private readonly analytics: AnalyticsService,
    private readonly config: ConfigService<Env, true>,
    private readonly mail: MailService,
  ) {}

  async syncClub(
    clubId: string,
    opts: { triggeredById?: string; now?: Date } = {},
  ): Promise<SyncOutcome> {
    const now = opts.now ?? new Date();
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      include: { connector: true },
    });
    if (!club?.connector) throw new NotFoundException('Club ou connecteur introuvable');

    // Une synchro « RUNNING » trop ancienne a été interrompue (crash) : on la clôt.
    await this.prisma.syncRun.updateMany({
      where: { clubId, status: 'RUNNING', startedAt: { lt: new Date(Date.now() - STALE_RUN_MS) } },
      data: { status: 'FAILED', finishedAt: new Date(), error: 'Synchronisation interrompue' },
    });

    let run: SyncRun;
    try {
      run = await this.prisma.syncRun.create({
        data: { clubId, status: 'RUNNING', triggeredById: opts.triggeredById },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return { status: 'SKIPPED', reason: 'ALREADY_RUNNING' };
      }
      throw e;
    }

    let bookingsFetched = 0;
    let entriesCreated = 0;
    try {
      const ctx: Ctx = {
        club: club as Ctx['club'],
        connector: this.registry.get(club.connector.provider),
        cfg: {
          externalClubId: club.connector.externalClubId,
          credentials: club.connector.credentialsEncrypted
            ? this.crypto.decryptJson(club.connector.credentialsEncrypted)
            : {},
        },
        rules: await this.rulesService.getActive(),
        now,
      };
      const lookbackMs = this.config.get('SYNC_LOOKBACK_DAYS', { infer: true }) * 86_400_000;
      const since = new Date((club.connector.lastSyncAt ?? now).getTime() - lookbackMs);

      const bookings = await ctx.connector.listEndedBookings(ctx.cfg, since, now);
      bookingsFetched = bookings.length;
      // Ordre chronologique : pour le plafond journalier, les premières parties jouées comptent en premier.
      bookings.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
      for (const b of bookings) entriesCreated += await this.processBooking(ctx, b);

      const done = await this.finish(run.id, clubId, 'SUCCESS', {
        bookingsFetched,
        entriesCreated,
        now,
      });
      await this.analytics.track('sync.completed', {
        clubId,
        payload: { bookingsFetched, entriesCreated },
      });
      return { status: 'SUCCESS', run: done };
    } catch (e) {
      const message = (e as Error).message.slice(0, 1000);
      this.logger.error(`Synchro du club ${club.name} en échec : ${message}`);
      const failed = await this.finish(run.id, clubId, 'FAILED', {
        bookingsFetched,
        entriesCreated,
        now,
        error: message,
      });
      await this.alertIfRepeatedFailures(club.id, club.name, message).catch((err) =>
        this.logger.error(`Alerte non envoyée : ${(err as Error).message}`),
      );
      return { status: 'FAILED', run: failed };
    }
  }

  private async finish(
    runId: string,
    clubId: string,
    status: 'SUCCESS' | 'FAILED',
    r: { bookingsFetched: number; entriesCreated: number; now: Date; error?: string },
  ): Promise<SyncRun> {
    const [run] = await this.prisma.$transaction([
      this.prisma.syncRun.update({
        where: { id: runId },
        data: {
          status,
          finishedAt: new Date(),
          bookingsFetched: r.bookingsFetched,
          entriesCreated: r.entriesCreated,
          error: r.error,
        },
      }),
      this.prisma.clubConnectorConfig.update({
        where: { clubId },
        // En cas d'échec, lastSyncAt n'avance pas : la prochaine synchro relira la même période.
        data:
          status === 'SUCCESS'
            ? {
                lastSyncAt: r.now,
                lastSyncStatus: status,
                lastSyncError: null,
                failureAlertSentAt: null,
              }
            : { lastSyncStatus: status, lastSyncError: r.error },
      }),
    ]);
    return run;
  }

  /** Traite une réservation ; renvoie le nombre d'écritures créées. */
  private async processBooking(ctx: Ctx, ext: ExternalBooking): Promise<number> {
    const data = {
      startsAt: ext.startsAt,
      endsAt: ext.endsAt,
      status: ext.status,
      bookerExternalId: ext.bookerExternalId,
      lastSyncedAt: ctx.now,
    };
    const booking = await this.prisma.booking.upsert({
      where: {
        provider_clubId_externalId: {
          provider: ext.provider,
          clubId: ctx.club.id,
          externalId: ext.externalId,
        },
      },
      create: { ...data, provider: ext.provider, clubId: ctx.club.id, externalId: ext.externalId },
      update: data,
    });

    if (REVERSIBLE_STATUSES.includes(booking.status)) return this.reverseBooking(ctx, booking.id);
    if (booking.status !== 'COMPLETED') return 0;

    const participants = await ctx.connector.getBookingParticipants(ctx.cfg, ext.externalId);
    if (participants.length) {
      await this.prisma.bookingParticipant.createMany({
        data: participants.map((p) => ({
          bookingId: booking.id,
          externalPlayerId: p.externalPlayerId,
        })),
        skipDuplicates: true,
      });
    }

    // Joueurs à créditer : tous les participants identifiés ; à défaut de liste, le réservataire.
    // La liste est relue à chaque synchronisation : si le club remplace un joueur par un autre,
    // les points suivent (retrait pour l'ancien, crédit pour le nouveau).
    const externalIds = new Set(participants.map((p) => p.externalPlayerId));
    if (booking.bookerExternalId) externalIds.add(booking.bookerExternalId);
    const links = externalIds.size
      ? await this.prisma.playerExternalLink.findMany({
          where: {
            provider: ext.provider,
            externalPlayerId: { in: [...externalIds] },
            // Pas de rétroactivité : seules les parties terminées après la liaison du compte comptent.
            linkedAt: { lte: booking.endsAt },
            user: { role: 'PLAYER', anonymizedAt: null },
          },
          select: { userId: true },
        })
      : [];
    const userIds = [...new Set(links.map((l) => l.userId))];

    // Écritures de cette réservation encore actives (non contre-passées)
    const existing = await this.prisma.ledgerEntry.findMany({
      where: {
        sourceType: 'BOOKING',
        sourceId: booking.id,
        type: { in: ['EARN', 'BONUS', 'REVERSAL'] },
      },
    });
    const reversedIds = new Set(
      existing.filter((e) => e.type === 'REVERSAL').map((e) => e.reversesEntryId),
    );
    const active = existing.filter((e) => e.type !== 'REVERSAL' && !reversedIds.has(e.id));

    // 1. Joueurs retirés de la réservation : contre-passation de leurs points
    const removed = active.filter((e) => !userIds.includes(e.userId));
    let count = removed.length ? await this.createReversals(ctx, booking.id, removed) : 0;

    // 2. Joueurs à créditer (plafond journalier de temps de jeu, chevauchements comptés une fois)
    const earnedAt = booking.endsAt;
    const common = {
      sourceType: 'BOOKING' as const,
      sourceId: booking.id,
      clubId: ctx.club.id,
      ruleSetVersion: ctx.rules.version,
      earnedAt,
      availableAt: new Date(earnedAt.getTime() + ctx.rules.pendingDelayMinutes * 60_000),
      expiresAt: addMonths(earnedAt, ctx.rules.expirationMonths),
    };
    let credited = 0;
    for (const userId of userIds) {
      if (active.some((e) => e.userId === userId)) continue; // déjà crédité
      const already = await this.creditedIntervalsSameDay(userId, booking, ctx.club.timezone);
      const intervals = creditableIntervals(
        { start: booking.startsAt, end: booking.endsAt },
        already,
        ctx.rules.dailyMaxMinutes,
      );
      const points = computeIntervalsPoints(
        intervals,
        { timezone: ctx.club.timezone, offPeakBonusEnabled: ctx.club.offPeakBonusEnabled },
        ctx.rules,
      );
      if (points.basePoints <= 0) continue; // plafond atteint ou partie entièrement chevauchée
      // Un joueur retiré puis réintégré reçoit une nouvelle écriture (nouvelle clé), jamais un doublon.
      const attempt = existing.filter((e) => e.userId === userId && e.type === 'EARN').length;
      const key = `booking:${booking.id}:user:${userId}`;
      const suffix = attempt ? `#${attempt}` : '';
      const entries: Prisma.LedgerEntryCreateManyInput[] = [
        {
          ...common,
          userId,
          type: 'EARN',
          amount: points.basePoints,
          idempotencyKey: `${key}:earn${suffix}`,
        },
      ];
      if (points.bonusPoints > 0) {
        entries.push({
          ...common,
          userId,
          type: 'BONUS',
          amount: points.bonusPoints,
          idempotencyKey: `${key}:bonus${suffix}`,
        });
      }
      const res = await this.prisma.ledgerEntry.createMany({ data: entries, skipDuplicates: true });
      count += res.count;
      if (res.count) credited++;
    }
    if (credited > 0) {
      await this.analytics.track('booking.credited', {
        clubId: ctx.club.id,
        payload: { bookingId: booking.id, players: credited },
      });
    }
    return count;
  }

  /** Parties du même joueur, le même jour (heure du club), dont les points sont actuellement crédités. */
  private async creditedIntervalsSameDay(
    userId: string,
    booking: { id: string; startsAt: Date },
    timezone: string,
  ): Promise<Interval[]> {
    const around = (h: number) => new Date(booking.startsAt.getTime() + h * 3600_000);
    const earns = await this.prisma.ledgerEntry.findMany({
      where: {
        userId,
        type: 'EARN',
        sourceType: 'BOOKING',
        sourceId: { not: booking.id },
        earnedAt: { gte: around(-30), lte: around(30) },
      },
      select: { id: true, sourceId: true },
    });
    if (!earns.length) return [];
    const reversed = new Set(
      (
        await this.prisma.ledgerEntry.findMany({
          where: { type: 'REVERSAL', reversesEntryId: { in: earns.map((e) => e.id) } },
          select: { reversesEntryId: true },
        })
      ).map((r) => r.reversesEntryId),
    );
    const ids = earns.filter((e) => !reversed.has(e.id)).map((e) => e.sourceId!);
    const day = localDayKey(booking.startsAt, timezone);
    const others = await this.prisma.booking.findMany({
      where: { id: { in: ids } },
      select: { startsAt: true, endsAt: true },
    });
    return others
      .filter((b) => localDayKey(b.startsAt, timezone) === day)
      .map((b) => ({ start: b.startsAt, end: b.endsAt }));
  }

  /** Partie annulée ou absence : contre-passation de chaque écriture déjà créditée (une seule fois). */
  private async reverseBooking(ctx: Ctx, bookingId: string): Promise<number> {
    const credited = await this.prisma.ledgerEntry.findMany({
      where: { sourceType: 'BOOKING', sourceId: bookingId, type: { in: ['EARN', 'BONUS'] } },
    });
    return credited.length ? this.createReversals(ctx, bookingId, credited) : 0;
  }

  private async createReversals(
    ctx: Ctx,
    bookingId: string,
    entries: {
      id: string;
      userId: string;
      amount: number;
      clubId: string | null;
      availableAt: Date;
    }[],
  ): Promise<number> {
    const { count } = await this.prisma.ledgerEntry.createMany({
      data: entries.map((e) => ({
        userId: e.userId,
        type: 'REVERSAL' as const,
        amount: -e.amount,
        sourceType: 'BOOKING' as const,
        sourceId: bookingId,
        clubId: e.clubId,
        reversesEntryId: e.id,
        idempotencyKey: `reversal:${e.id}`,
        ruleSetVersion: ctx.rules.version,
        earnedAt: ctx.now,
        // Annulation d'un gain encore en attente : reste « en attente » jusqu'à la même échéance.
        availableAt: e.availableAt > ctx.now ? e.availableAt : ctx.now,
      })),
      skipDuplicates: true,
    });
    if (count > 0) {
      await this.analytics.track('booking.reversed', {
        clubId: ctx.club.id,
        payload: { bookingId, entries: count },
      });
    }
    return count;
  }

  /** Après N échecs consécutifs, un email unique aux super admins (réarmé au premier succès). */
  private async alertIfRepeatedFailures(clubId: string, clubName: string, error: string) {
    const last = await this.prisma.syncRun.findMany({
      where: { clubId, status: { not: 'RUNNING' } },
      orderBy: { startedAt: 'desc' },
      take: FAILURE_ALERT_THRESHOLD,
      select: { status: true },
    });
    if (last.length < FAILURE_ALERT_THRESHOLD || last.some((r) => r.status !== 'FAILED')) return;

    const armed = await this.prisma.clubConnectorConfig.updateMany({
      where: { clubId, failureAlertSentAt: null },
      data: { failureAlertSentAt: new Date() },
    });
    if (armed.count === 0) return; // déjà alerté

    const admins = await this.prisma.user.findMany({
      where: { role: 'SUPER_ADMIN', disabledAt: null, anonymizedAt: null },
      select: { email: true },
    });
    await this.mail.sendAlert(
      admins.map((a) => a.email),
      `Synchronisation en échec : ${clubName}`,
      `La synchronisation des réservations du club « ${clubName} » a échoué ${FAILURE_ALERT_THRESHOLD} fois de suite.\n\n` +
        `Dernière erreur : ${error}\n\nLes points GPR des parties jouées ne sont plus crédités ni annulés tant que la synchronisation ne fonctionne pas. ` +
        `Vérifiez le connecteur dans le back-office (Clubs → ${clubName}), puis relancez une synchronisation.`,
    );
    this.logger.warn(
      `Alerte envoyée : ${FAILURE_ALERT_THRESHOLD} échecs consécutifs pour ${clubName}`,
    );
  }
}
