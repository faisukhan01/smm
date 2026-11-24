/**
 * GET /api/v1/analytics/export.csv — ported from NestJS AnalyticsController.exportCsv.
 * Streams real post records as CSV. Columns and row order match the Nest
 * implementation exactly; rows are joined with CRLF.
 *
 * Note: the Nest controller returned the raw CSV string with no download
 * headers (the browser client supplies its own filename). Here we additionally
 * set `Content-Type: text/csv` and a `Content-Disposition: attachment` header
 * using the client's `analytics_<from>_<to>.csv` convention.
 */
import { db } from '@/lib/db';
import { requireAuth, requirePermission } from '@/lib/server/api/context';
import { handleError, query } from '@/lib/server/api/handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function safeFilePart(value: string | null, fallback: string): string {
  return (value && value.replace(/[^A-Za-z0-9._-]/g, '-')) || fallback;
}

export async function GET(req: Request): Promise<Response> {
  try {
    const auth = await requireAuth();
    requirePermission(auth, 'analytics:read');
    const q = query(req);
    const from = q.get('from');
    const to = q.get('to');

    const where = from || to
      ? {
          workspaceId: auth.workspaceId,
          createdAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        }
      : { workspaceId: auth.workspaceId };
    const posts = await db.post.findMany({
      where,
      include: { targets: { select: { platform: true } } },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });
    const rows = [
      ['id', 'status', 'platforms', 'scheduled_at', 'published_at', 'content'].join(','),
      ...posts.map((p) =>
        [
          p.id,
          p.status,
          p.targets.map((t) => t.platform).join('|'),
          p.scheduledAt?.toISOString() ?? '',
          p.publishedAt?.toISOString() ?? '',
          csvEscape(p.content.replace(/\r?\n/g, ' ')),
        ].join(','),
      ),
    ];
    const csv = rows.join('\r\n');

    const filename = `analytics_${safeFilePart(from, 'all')}_${safeFilePart(to, 'all')}.csv`;
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
