/**
 * POST /api/v1/auth/register — port of mini-services/api AuthController.register
 * + AuthService.register / createOwnedWorkspace (201 + Set-Cookie).
 */
import { NextResponse } from 'next/server';
import type { SessionPayload } from '@smm/shared';
import { registerSchema } from '@smm/shared';
import { db } from '@/lib/db';
import { setSessionCookie } from '@/lib/server/api/context';
import { conflict } from '@/lib/server/api/errors';
import { handleError, ok, parseBody } from '@/lib/server/api/handler';
import { signSessionToken } from '@/lib/server/api/jwt';
import { hashPassword } from '@/lib/server/api/password';
import { buildSessionPayload } from '@/lib/server/api/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Port of AuthService.createOwnedWorkspace — workspace + OWNER membership + FREE subscription + AI settings + welcome notification, in one transaction. */
async function createOwnedWorkspace(ownerId: string, name: string) {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'workspace';
  const slug = `${base}-${crypto.randomUUID().slice(0, 8)}`;
  return db.$transaction(async (tx) => {
    const workspace = await tx.workspace.create({
      data: { name, slug, ownerId },
    });
    await tx.workspaceMember.create({
      data: { workspaceId: workspace.id, userId: ownerId, role: 'OWNER', status: 'ACTIVE' },
    });
    await tx.subscription.create({
      data: { workspaceId: workspace.id, plan: 'FREE', status: 'ACTIVE', periodStart: new Date() },
    });
    await tx.aiSettings.create({
      data: { workspaceId: workspace.id, mode: 'MANUAL' },
    });
    await tx.notification.create({
      data: {
        workspaceId: workspace.id,
        type: 'WORKSPACE_CREATED',
        title: 'Welcome to SMM',
        body: 'Connect a social account and configure your brand profile to get started.',
      },
    });
    return workspace;
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = await parseBody(req, registerSchema);

    const email = body.email.toLowerCase().trim();
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) throw conflict('An account with this email already exists');

    const user = await db.user.create({
      data: {
        email,
        name: body.name.trim(),
        passwordHash: hashPassword(body.password),
        verifyToken: crypto.randomUUID(),
      },
    });

    const workspace = await createOwnedWorkspace(
      user.id,
      `${body.name.trim().split(' ')[0] || 'My'} Workspace`,
    );

    const session: SessionPayload = await buildSessionPayload(user.id, workspace.id);
    const res = ok(session, 201);
    setSessionCookie(res, user.id, workspace.id, signSessionToken(user.id, workspace.id));
    return res;
  } catch (err) {
    return handleError(err);
  }
}
