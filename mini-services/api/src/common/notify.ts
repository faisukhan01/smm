import type { PrismaService } from './prisma.module';

export interface NotifyInput {
  workspaceId: string;
  type: string;
  title: string;
  body?: string | null;
}

/** Creates a workspace-scoped in-app notification. */
export async function notify(prisma: PrismaService, input: NotifyInput): Promise<void> {
  await prisma.notification.create({
    data: {
      workspaceId: input.workspaceId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
    },
  });
}
