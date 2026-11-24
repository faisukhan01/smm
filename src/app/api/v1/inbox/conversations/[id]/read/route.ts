/**
 * POST /api/v1/inbox/conversations/[id]/read — mark a conversation as read.
 *
 * No counterpart exists in the Nest API and the current Prisma schema carries
 * no per-conversation read state (Conversation/Message have no readAt or
 * unread flag). The endpoint is provided for wire compatibility with clients
 * that mark threads read: it authenticates, scopes the lookup to the active
 * workspace (404 for foreign ids) and returns 204. Persisted unread tracking
 * requires a schema change and is intentionally out of scope here.
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, requirePermission } from '@/lib/server/api/context';
import { handleError, noContent } from '@/lib/server/api/handler';
import { notFound } from '@/lib/server/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await params;
    const auth = await requireAuth();
    requirePermission(auth, 'inbox:read');
    const conversation = await db.conversation.findFirst({
      where: { id, workspaceId: auth.workspaceId },
      select: { id: true },
    });
    if (!conversation) throw notFound('Conversation not found');
    return noContent();
  } catch (err) {
    return handleError(err);
  }
}
