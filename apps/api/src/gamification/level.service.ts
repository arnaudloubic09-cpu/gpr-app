import { Injectable } from '@nestjs/common';
import { computeLevel, LevelStatus, LevelThreshold } from '@gpr/core';
import { PrismaService } from '../prisma/prisma.service';
import { RulesService } from '../rules/rules.service';

@Injectable()
export class LevelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: RulesService,
  ) {}

  async status(userId: string, now = new Date()): Promise<LevelStatus> {
    const [entries, rules] = await Promise.all([
      this.prisma.ledgerEntry.findMany({ where: { userId } }),
      this.rules.getActive(),
    ]);
    return computeLevel(entries, now, rules.levels);
  }
}

/** Rang d'un niveau (0 = le plus bas). -1 si inconnu. */
export function levelRank(levels: LevelThreshold[], code: string | null | undefined): number {
  if (!code) return 0;
  return [...levels].sort((a, b) => a.minGpr - b.minGpr).findIndex((l) => l.code === code);
}
