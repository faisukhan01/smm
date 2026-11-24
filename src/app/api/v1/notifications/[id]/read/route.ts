/**
 * POST /api/v1/notifications/:id/read — ported from NestJS
 * NotificationsController.readOne (@HttpCode(204)). Marks a single
 * workspace-scoped notification as read. Unknown ids respond 204 as well
 * (the Nest implementation silently no-ops), never 404.
 */
import { db } from '@/lib/db';
import { requireAuth, requirePermission } from '@/lib/server/api/context';
import { handleError, noContent } from '@/lib/server/api/handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const auth = await requireAuth();
    requirePermission(auth, 'workspace:read');
    const notification = await db.notification.findFirst({
      where: { id, workspaceId: auth.workspaceId },
    });
    if (!notification) return noContent();
    await db.notification.update({ where: { id: notification.id }, data: { read: true } });
    return noContent();
  } catch (err) {
    return handleError(err);
  }
}
