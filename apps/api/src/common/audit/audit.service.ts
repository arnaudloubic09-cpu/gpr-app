import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditInput {
  actor: { id: string; role: Role } | null;
  action: string;
  entityType: string;
  entityId?: string;
  clubId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string;
}

/** Journal d'audit immuable (trigger SQL). */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditInput, tx: Prisma.TransactionClient = this.prisma): Promise<void> {
    await tx.auditLog.create({
      data: {
        actorId: input.actor?.id,
        actorRole: input.actor?.role,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        clubId: input.clubId ?? undefined,
        before: (input.before ?? undefined) as Prisma.InputJsonValue | undefined,
        after: (input.after ?? undefined) as Prisma.InputJsonValue | undefined,
        ip: input.ip,
      },
    });
  }
}
