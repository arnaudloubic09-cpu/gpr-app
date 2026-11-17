import { Injectable, InternalServerErrorException } from '@nestjs/common';
import type { GprRules, LevelThreshold, OffPeakWindow } from '@gpr/core';
import { PrismaService } from '../prisma/prisma.service';

export interface ActiveRules extends GprRules {
  version: number;
}

/** Règles GPR globales : la version la plus récente est active. */
@Injectable()
export class RulesService {
  constructor(private readonly prisma: PrismaService) {}

  async getActive(): Promise<ActiveRules> {
    const rs = await this.prisma.ruleSet.findFirst({ orderBy: { version: 'desc' } });
    if (!rs) throw new InternalServerErrorException('Aucune règle GPR configurée (lancer le seed)');
    return {
      version: rs.version,
      pointsPerSlot: rs.pointsPerSlot,
      slotMinutes: rs.slotMinutes,
      dailyCapPerPlayer: rs.dailyCapPerPlayer,
      pendingDelayMinutes: rs.pendingDelayMinutes,
      expirationMonths: rs.expirationMonths,
      couponValidityDays: rs.couponValidityDays,
      offPeakMultiplier: Number(rs.offPeakMultiplier),
      offPeakWindows: rs.offPeakWindows as unknown as OffPeakWindow[],
      levels: rs.levels as unknown as LevelThreshold[],
    };
  }
}
