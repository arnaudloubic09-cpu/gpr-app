import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Événements produit pour les statistiques du super admin. Ne bloque jamais le flux métier. */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async track(
    type: string,
    data: { userId?: string; clubId?: string; payload?: Record<string, unknown> } = {},
  ) {
    try {
      await this.prisma.analyticsEvent.create({
        data: {
          type,
          userId: data.userId,
          clubId: data.clubId,
          payload: (data.payload ?? {}) as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      this.logger.warn(`Événement analytics non enregistré (${type}) : ${(err as Error).message}`);
    }
  }
}
