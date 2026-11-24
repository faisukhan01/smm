/**
 * GET / PUT / PATCH /api/v1/brand — ported from NestJS BrandController
 * (mini-services/api/src/modules/brand/brand.controller.ts).
 *
 * GET returns the nullable BrandProfile (the UI treats null as "not
 * configured yet"). PUT is the former API's upsert verb; PATCH is wired to
 * the same upsert so both spellings keep working. Every upsert writes a
 * BRAND_UPDATED audit entry.
 */
import { brandSchema, type BrandInput } from '@smm/shared';
import { db } from '@/lib/db';
import { requireAuth, requirePermission, type AuthContext } from '@/lib/server/api/context';
import { handleError, ok, parseBody } from '@/lib/server/api/handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Records an audit trail entry (port of common/audit.ts writeAudit). */
async function writeAudit(input: {
  workspaceId: string;
  actorId?: string;
  action: string;
  entity: string;
  entityId?: string | null;
  meta?: import('@prisma/client').Prisma.InputJsonValue;
}): Promise<void> {
  await db.auditLog.create({
    data: {
      workspaceId: input.workspaceId,
      actorId: input.actorId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      meta: input.meta ?? undefined,
    },
  });
}

async function getBrand(): Promise<Response> {
  const auth = await requireAuth();
  requirePermission(auth, 'brand:read');
  // Nullable by design: the UI treats a missing profile as "not configured yet".
  const profile = await db.brandProfile.findUnique({ where: { workspaceId: auth.workspaceId } });
  return ok(profile);
}

async function upsertBrand(req: Request, auth: AuthContext): Promise<Response> {
  requirePermission(auth, 'brand:write');
  const body: BrandInput = await parseBody(req, brandSchema);
  const profile = await db.brandProfile.upsert({
    where: { workspaceId: auth.workspaceId },
    create: { workspaceId: auth.workspaceId, ...body },
    update: { ...body },
  });
  await writeAudit({
    workspaceId: auth.workspaceId,
    actorId: auth.userId,
    action: 'BRAND_UPDATED',
    entity: 'BrandProfile',
    entityId: profile.id,
  });
  return ok(profile);
}

export async function GET(): Promise<Response> {
  try {
    return await getBrand();
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(req: Request): Promise<Response> {
  try {
    const auth = await requireAuth();
    return await upsertBrand(req, auth);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: Request): Promise<Response> {
  try {
    const auth = await requireAuth();
    return await upsertBrand(req, auth);
  } catch (err) {
    return handleError(err);
  }
}
