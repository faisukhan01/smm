/**
 * POST /api/v1/notifications/read-all — ported from NestJS
 * NotificationsController.readAll (@HttpCode(204)). Marks every unread
 * workspace notification as read. Returns 204 with no body.
 */
import { db } from '@/lib/db';
import { requireAuth, requirePermission } from '@/lib/server/api/context';
import { handleError, noContent } from '@/lib/server/api/handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(): Promise<Response> {
  try {
    const auth = await requireAuth();
    requirePermission(auth, 'workspace:read');
    await db.notification.updateMany({
      where: { workspaceId: auth.workspaceId, read: false },
      data: { read: true },
    });
    return noContent();
  } catch (err) {
    return handleError(err);
  }
}
