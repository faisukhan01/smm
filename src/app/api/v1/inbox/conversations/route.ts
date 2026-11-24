/**
 * GET /api/v1/inbox/conversations?status=OPEN|RESOLVED — list conversations.
 * Port of InboxController.conversations() (Nest: GET /inbox/conversations).
 * Any ?status value other than OPEN/RESOLVED is ignored (no status filter),
 * exactly like the Nest implementation.
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, requirePermission } from '@/lib/server/api/context';
import { handleError, query } from '@/lib/server/api/handler';
import { mapConversation } from '../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const auth = await requireAuth();
    requirePermission(auth, 'inbox:read');
    const status = query(req).get('status') ?? undefined;
    const where: { workspaceId: string; status?: 'OPEN' | 'RESOLVED' } = { workspaceId: auth.workspaceId };
    if (status === 'OPEN' || status === 'RESOLVED') where.status = status;
    const rows = await db.conversation.findMany({
      where,
      include: { account: true, messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
    });
    return NextResponse.json({ items: rows.map(mapConversation) });
  } catch (err) {
    return handleError(err);
  }
}
