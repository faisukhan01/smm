/**
 * POST /api/v1/accounts/demo — connect a sandbox demo account.
 * Port of AccountsController.connectDemo() (Nest: POST /accounts/demo).
 * Enforces the plan account quota, seeds one clearly-labeled sample
 * conversation so the Inbox is explorable, writes audit + notification.
 */
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAuth, requirePermission } from '@/lib/server/api/context';
import { handleError, ok, parseBody } from '@/lib/server/api/handler';
import { PLATFORM_LABEL, PLATFORMS } from '@smm/shared';
import { assertAccountQuota, mapAccount, notifyWorkspace, writeAudit } from '../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const platformSchema = z.object({ platform: z.enum(PLATFORMS) });

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const auth = await requireAuth();
    requirePermission(auth, 'account:connect');
    const body = await parseBody(req, platformSchema);
    await assertAccountQuota(auth.workspaceId);

    const workspace = await db.workspace.findUniqueOrThrow({ where: { id: auth.workspaceId } });
    const slug = workspace.slug || 'workspace';
    const account = await db.socialAccount.create({
      data: {
        workspaceId: auth.workspaceId,
        platform: body.platform,
        externalId: `demo_${randomUUID().slice(0, 8)}`,
        username: `${slug}.demo`,
        displayName: `${workspace.name} — ${PLATFORM_LABEL[body.platform]} (demo)`,
        status: 'CONNECTED',
        isDemo: true,
        connectedById: auth.userId,
      },
    });

    // Seed one clearly-labeled sample conversation so the Inbox is explorable.
    const conversation = await db.conversation.create({
      data: {
        workspaceId: auth.workspaceId,
        accountId: account.id,
        platform: body.platform,
        externalId: `sample_${randomUUID().slice(0, 8)}`,
        participantName: 'Sample Customer',
        subject: 'Product question',
      },
    });
    const now = Date.now();
    await db.message.createMany({
      data: [
        {
          conversationId: conversation.id,
          direction: 'IN',
          authorName: 'Sample Customer',
          text: 'Hi! I just saw your latest post — is this available in other colors?',
          createdAt: new Date(now - 120000),
        },
        {
          conversationId: conversation.id,
          direction: 'IN',
          authorName: 'Sample Customer',
          text: 'Also, do you ship internationally?',
          createdAt: new Date(now - 60000),
        },
      ],
    });

    await writeAudit({
      workspaceId: auth.workspaceId,
      actorId: auth.userId,
      action: 'ACCOUNT_CONNECTED',
      entity: 'SocialAccount',
      entityId: account.id,
      meta: { demo: true, platform: body.platform },
    });
    await notifyWorkspace({
      workspaceId: auth.workspaceId,
      type: 'ACCOUNT_CONNECTED',
      title: `${PLATFORM_LABEL[body.platform]} demo connected`,
      body: 'Sandbox connection for evaluation — no real platform data.',
    });
    return ok(mapAccount(account), 201);
  } catch (err) {
    return handleError(err);
  }
}
