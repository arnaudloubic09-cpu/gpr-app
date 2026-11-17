import { Injectable, Logger } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PushSender } from './push-sender';

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Clé unique : la même notification n'est jamais créée ni envoyée deux fois. */
  dedupeKey: string;
}

/**
 * Centre de notifications (toujours) + push (seulement si le joueur l'a accepté
 * et a un appareil enregistré).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushSender,
  ) {}

  async notifyMany(inputs: NotifyInput[]): Promise<number> {
    if (!inputs.length) return 0;
    const existing = await this.prisma.notification.findMany({
      where: { dedupeKey: { in: inputs.map((i) => i.dedupeKey) } },
      select: { dedupeKey: true },
    });
    const known = new Set(existing.map((e) => e.dedupeKey));
    const fresh = inputs.filter((i) => !known.has(i.dedupeKey));
    if (!fresh.length) return 0;

    await this.prisma.notification.createMany({
      data: fresh.map((i) => ({ ...i, data: (i.data ?? {}) as Prisma.InputJsonValue })),
      skipDuplicates: true,
    });
    // Relecture : seules les notifications réellement créées par cet appel sont envoyées.
    const created = await this.prisma.notification.findMany({
      where: { dedupeKey: { in: fresh.map((i) => i.dedupeKey) }, pushedAt: null },
    });
    await this.pushFor(created);
    return created.length;
  }

  notify(input: NotifyInput) {
    return this.notifyMany([input]);
  }

  private async pushFor(
    list: { id: string; userId: string; title: string; body: string; data: Prisma.JsonValue }[],
  ) {
    if (!list.length) return;
    const userIds = [...new Set(list.map((n) => n.userId))];
    const consenting = await this.consentingUsers(userIds);
    const tokens = await this.prisma.pushToken.findMany({
      where: { userId: { in: [...consenting] } },
    });
    const messages = list.flatMap((n) =>
      tokens
        .filter((t) => t.userId === n.userId)
        .map((t) => ({
          to: t.token,
          title: n.title,
          body: n.body,
          data: { ...(n.data as object), notificationId: n.id },
        })),
    );
    // Marquées « traitées » avant l'envoi : jamais de double envoi, même en cas de relance.
    const claimed = await this.prisma.notification.updateMany({
      where: { id: { in: list.map((n) => n.id) }, pushedAt: null },
      data: { pushedAt: new Date() },
    });
    if (claimed.count === 0 || !messages.length) return;
    try {
      await this.push.send(messages);
    } catch (e) {
      this.logger.error(`Envoi push impossible : ${(e as Error).message}`);
    }
  }

  /** Dernier consentement « notifications » de chaque joueur = true. */
  private async consentingUsers(userIds: string[]): Promise<Set<string>> {
    const rows = await this.prisma.consent.findMany({
      where: { userId: { in: userIds }, type: 'PUSH_NOTIFICATIONS' },
      orderBy: { createdAt: 'desc' },
      distinct: ['userId'],
      select: { userId: true, granted: true },
    });
    return new Set(rows.filter((r) => r.granted).map((r) => r.userId));
  }

  list(userId: string) {
    return Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          data: true,
          readAt: true,
          createdAt: true,
        },
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]).then(([items, unread]) => ({ items, unread }));
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
