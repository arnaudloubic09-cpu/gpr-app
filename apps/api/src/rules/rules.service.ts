import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { RuleSetInput } from '@gpr/core';
import type { AuthUser } from '../auth/auth.types';
import { AuditService } from '../common/audit/audit.service';
import type { GprRules, LevelThreshold, OffPeakWindow } from '@gpr/core';
import { PrismaService } from '../prisma/prisma.service';

export interface ActiveRules extends GprRules {
  version: number;
}

/** Règles GPR globales : la version la plus récente est active. */
@Injectable()
export class RulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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
      clubAdjustmentMax: rs.clubAdjustmentMax,
      offPeakMultiplier: Number(rs.offPeakMultiplier),
      offPeakWindows: rs.offPeakWindows as unknown as OffPeakWindow[],
      levels: rs.levels as unknown as LevelThreshold[],
    };
  }

  /** Historique des versions (la plus récente en premier). */
  history() {
    return this.prisma.ruleSet.findMany({ orderBy: { version: 'desc' }, take: 50 });
  }

  /**
   * Nouvelle version des règles : jamais de modification d'une version existante,
   * chaque écriture du ledger garde la version qui l'a produite.
   */
  async createVersion(input: RuleSetInput, actor: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const last = await tx.ruleSet.findFirst({ orderBy: { version: 'desc' } });
      const created = await tx.ruleSet.create({
        data: {
          ...input,
          offPeakWindows: input.offPeakWindows as unknown as Prisma.InputJsonValue,
          levels: input.levels as unknown as Prisma.InputJsonValue,
          version: (last?.version ?? 0) + 1,
          createdById: actor.id,
        },
      });
      await this.audit.log(
        {
          actor: { id: actor.id, role: actor.role },
          action: 'rules.version.create',
          entityType: 'RuleSet',
          entityId: created.id,
          before: last ? { version: last.version } : undefined,
          after: { version: created.version, ...input },
        },
        tx,
      );
      return created;
    });
  }
}
