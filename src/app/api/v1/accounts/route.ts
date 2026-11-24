/**
 * GET /api/v1/accounts — list connected accounts for the active workspace.
 * Port of AccountsController.list() (Nest: GET /accounts).
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, requirePermission } from '@/lib/server/api/context';
import { handleError } from '@/lib/server/api/handler';
import { mapAccount } from './_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const auth = await requireAuth();
    requirePermission(auth, 'account:read');
    const rows = await db.socialAccount.findMany({
      where: { workspaceId: auth.workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(rows.map(mapAccount));
  } catch (err) {
    return handleError(err);
  }
}
