import type { Prisma } from '@prisma/client';
import type { PrismaService } from './prisma.module';

export interface AuditInput {
  workspaceId: string;
  actorId?: string;
  action: string;
  entity: string;
  entityId?: string | null;
  meta?: Record<string, unknown>;
}

/** Records an audit trail entry for a workspace mutation. */
export async function writeAudit(prisma: PrismaService, input: AuditInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      workspaceId: input.workspaceId,
      actorId: input.actorId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      meta: (input.meta ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
