/**
 * Audit trail — mirrors the former NestJS API's common/audit.ts.
 */
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

export interface AuditInput {
  workspaceId: string;
  actorId?: string;
  action: string;
  entity: string;
  entityId?: string | null;
  meta?: Record<string, unknown>;
}

/** Records an audit trail entry for a workspace mutation. */
export async function writeAudit(input: AuditInput): Promise<void> {
  await db.auditLog.create({
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
