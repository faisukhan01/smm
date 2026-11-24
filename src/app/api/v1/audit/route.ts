/**
 * GET /api/v1/audit — ported from NestJS AuditController.list.
 * Paginated workspace audit trail; requires the `audit:read` permission
 * (OWNER/ADMIN only, same as the former API).
 */
import { db } from '@/lib/db';
import { requireAuth, requirePermission } from '@/lib/server/api/context';
import { handleError, ok, query } from '@/lib/server/api/handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Small request-parsing helpers, ported from the API's common/parse. */
function parsePositiveInt(value: unknown, fallback: number): number {
  const n = typeof value === 'string' ? Number.parseInt(value, 10) : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export async function GET(req: Request): Promise<Response> {
  try {
    const auth = await requireAuth();
    requirePermission(auth, 'audit:read');
    const q = query(req);
    const page = clampInt(parsePositiveInt(q.get('page') ?? undefined, 1), 1, 10_000);
    const pageSize = clampInt(parsePositiveInt(q.get('pageSize') ?? undefined, 25), 1, 100);
    const [items, total] = await Promise.all([
      db.auditLog.findMany({
        where: { workspaceId: auth.workspaceId },
        include: { actor: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.auditLog.count({ where: { workspaceId: auth.workspaceId } }),
    ]);
    return ok({
      items: items.map((log) => ({
        id: log.id,
        action: log.action,
        entity: log.entity,
        entityId: log.entityId,
        actorName: log.actor?.name ?? null,
        createdAt: log.createdAt,
        meta: log.meta,
      })),
      total,
      page,
      pageSize,
    });
  } catch (err) {
    return handleError(err);
  }
}
