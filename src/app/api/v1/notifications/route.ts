/**
 * GET /api/v1/notifications — ported from NestJS NotificationsController.list.
 * Workspace-scoped in-app notifications for the current user, latest first,
 * plus the total unread count.
 */
import { db } from '@/lib/db';
import { requireAuth, requirePermission } from '@/lib/server/api/context';
import { handleError, ok } from '@/lib/server/api/handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const auth = await requireAuth();
    requirePermission(auth, 'workspace:read');
    const [items, unread] = await Promise.all([
      db.notification.findMany({
        where: { workspaceId: auth.workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      db.notification.count({ where: { workspaceId: auth.workspaceId, read: false } }),
    ]);
    return ok({ items, unread });
  } catch (err) {
    return handleError(err);
  }
}
