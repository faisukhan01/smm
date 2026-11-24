/**
 * /api/v1/ai-settings — per-workspace AI settings (mode MANUAL/APPROVAL/AUTO,
 * autoReply, restrictedTopics).
 * Port of the former NestJS AiSettingsController (@Controller('ai-settings')):
 * GET returns the settings row, or the MANUAL default when none exist yet;
 * PUT upserts the provided fields and writes an AI_SETTINGS_UPDATED audit
 * entry. The Nest API exposed PUT; PATCH is exported as an alias so both
 * verbs hit the same handler.
 */
import { parseBody, ok, handleError } from '@/lib/server/api/handler';
import { requireAuth, requirePermission } from '@/lib/server/api/context';
import { db } from '@/lib/db';
import { writeAudit } from '@/lib/server/ai/audit';
import { aiSettingsSchema } from '@smm/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  try {
    const auth = await requireAuth();
    requirePermission(auth, 'workspace:read');
    const settings = await db.aiSettings.findUnique({ where: { workspaceId: auth.workspaceId } });
    return ok(settings ?? { mode: 'MANUAL', autoReply: false, restrictedTopics: null });
  } catch (err) {
    return handleError(err);
  }
}

async function putSettings(req: Request) {
  const auth = await requireAuth();
  requirePermission(auth, 'workspace:update');
  const body = await parseBody(req, aiSettingsSchema);
  const settings = await db.aiSettings.upsert({
    where: { workspaceId: auth.workspaceId },
    create: {
      workspaceId: auth.workspaceId,
      mode: body.mode ?? 'MANUAL',
      autoReply: body.autoReply ?? false,
      restrictedTopics: body.restrictedTopics ?? null,
    },
    update: {
      ...(body.mode !== undefined ? { mode: body.mode } : {}),
      ...(body.autoReply !== undefined ? { autoReply: body.autoReply } : {}),
      ...(body.restrictedTopics !== undefined ? { restrictedTopics: body.restrictedTopics } : {}),
    },
  });
  await writeAudit({
    workspaceId: auth.workspaceId,
    actorId: auth.userId,
    action: 'AI_SETTINGS_UPDATED',
    entity: 'AiSettings',
    entityId: settings.id,
    meta: { mode: settings.mode },
  });
  return ok(settings);
}

export async function PUT(req: Request) {
  try {
    return await putSettings(req);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: Request) {
  try {
    return await putSettings(req);
  } catch (err) {
    return handleError(err);
  }
}
