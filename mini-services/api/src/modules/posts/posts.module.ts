import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma.module';
import { PrismaModule } from '../../common/prisma.module';
import { AuthGuard, requirePermission, type AuthContext } from '../../common/auth.guard';
import { CurrentAuth } from '../../common/current-auth.decorator';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { writeAudit } from '../../common/audit';
import { notify } from '../../common/notify';
import { assertQuota, loadPlan } from '../../common/plans';
import {
  createPostSchema,
  schedulePostSchema,
  updatePostSchema,
  POST_STATUSES,
  type PostDTO,
  type PostStatus,
} from '@smm/shared';
import { z } from 'zod';
import type { Prisma, SocialAccount } from '@prisma/client';

// ---------------------------------------------------------------------------
// DTO mapping
// ---------------------------------------------------------------------------

type PostWithRelations = Prisma.PostGetPayload<{
  include: { media: true; targets: true; author: { select: { name: true } } };
}>;

export function mapPost(post: PostWithRelations): PostDTO {
  return {
    id: post.id,
    content: post.content,
    hashtags: post.hashtags,
    status: post.status as PostStatus,
    origin: post.origin,
    scheduledAt: post.scheduledAt?.toISOString() ?? null,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    failureReason: post.failureReason,
    authorName: post.author.name,
    media: post.media
      .filter((m) => m.postId === post.id)
      .map((m) => ({
        id: m.id,
        type: m.type,
        url: m.url,
        aspectRatio: m.aspectRatio,
        altText: m.altText,
        provider: m.provider,
      })),
    targets: post.targets.map((t) => ({
      id: t.id,
      accountId: t.accountId,
      platform: t.platform,
      status: t.status as PostStatus,
      externalPostId: t.externalPostId,
      publishedAt: t.publishedAt?.toISOString() ?? null,
      error: t.error,
    })),
  };
}

const INCLUDE = {
  media: true,
  targets: true,
  author: { select: { name: true } },
} as const;

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

@Controller('posts')
@UseGuards(AuthGuard)
export class PostsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @CurrentAuth() auth: AuthContext,
    @Query('status') status?: string,
    @Query('platform') platform?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    requirePermission(auth, 'post:read');
    const p = Math.max(1, Number(page) || 1);
    const size = Math.min(100, Math.max(1, Number(pageSize) || 20));

    const where: Prisma.PostWhereInput = { workspaceId: auth.workspaceId };
    if (status && (POST_STATUSES as readonly string[]).includes(status)) {
      where.status = status as PostStatus;
    }
    if (platform && ['FACEBOOK', 'INSTAGRAM', 'PINTEREST'].includes(platform)) {
      where.targets = { some: { platform: platform as 'FACEBOOK' | 'INSTAGRAM' | 'PINTEREST' } };
    }
    if (from || to) {
      const range: Prisma.DateTimeFilter = {};
      if (from) range.gte = new Date(from);
      if (to) range.lte = new Date(to);
      where.OR = [{ createdAt: range }, { scheduledAt: range }, { publishedAt: range }];
    }

    const [rows, total, statusRows] = await Promise.all([
      this.prisma.post.findMany({
        where,
        include: INCLUDE,
        orderBy: { updatedAt: 'desc' },
        skip: (p - 1) * size,
        take: size,
      }),
      this.prisma.post.count({ where }),
      this.prisma.post.groupBy({
        by: ['status'],
        where: { workspaceId: auth.workspaceId },
        _count: { _all: true },
      }),
    ]);

    const counts = Object.fromEntries(
      POST_STATUSES.map((s) => [s, statusRows.find((r) => r.status === s)?._count._all ?? 0]),
    ) as Record<PostStatus, number>;

    return { items: rows.map(mapPost), total, counts };
  }

  @Get(':id')
  async get(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    requirePermission(auth, 'post:read');
    const post = await this.prisma.post.findFirst({
      where: { id, workspaceId: auth.workspaceId },
      include: INCLUDE,
    });
    if (!post) throw new NotFoundException('Post not found');
    return mapPost(post);
  }

  @Post()
  async create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createPostSchema)) body: z.infer<typeof createPostSchema>,
  ) {
    requirePermission(auth, 'post:draft');
    const used = await this.prisma.post.count({
      where: { workspaceId: auth.workspaceId, createdAt: { gte: new Date(Date.now() - 30 * 864e5) } },
    });
    await assertQuota(this.prisma, auth.workspaceId, 'posts', used);
    const media = await this.resolveMedia(auth, body.mediaIds);
    const accounts = await this.assertAccounts(auth, body.targetAccountIds);
    const byId = new Map(accounts.map((a) => [a.id, a]));
    const post = await this.prisma.post.create({
      data: {
        workspaceId: auth.workspaceId,
        authorId: auth.userId,
        content: body.content,
        hashtags: body.hashtags,
        status: body.status,
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
        aiModel: body.aiModel ?? null,
        aiPrompt: body.aiPrompt ?? null,
        media: { connect: media.map((m) => ({ id: m.id })) },
        targets: {
          create: body.targetAccountIds.map((accountId) => ({
            accountId,
            platform: byId.get(accountId)!.platform,
            status: body.status === 'APPROVED' ? 'APPROVED' : 'PENDING_APPROVAL',
          })),
        },
      },
      include: INCLUDE,
    });
    await writeAudit(this.prisma, {
      workspaceId: auth.workspaceId,
      actorId: auth.userId,
      action: 'POST_CREATED',
      entity: 'Post',
      entityId: post.id,
    });
    return mapPost(post);
  }

  @Patch(':id')
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePostSchema)) body: z.infer<typeof updatePostSchema>,
  ) {
    requirePermission(auth, 'post:edit');
    const post = await this.prisma.post.findFirst({
      where: { id, workspaceId: auth.workspaceId },
      include: INCLUDE,
    });
    if (!post) throw new NotFoundException('Post not found');
    const editable: PostStatus[] = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SCHEDULED'];
    if (!editable.includes(post.status as PostStatus)) {
      throw new BadRequestException('Post can no longer be edited');
    }
    if (body.targetAccountIds) await this.assertAccounts(auth, body.targetAccountIds);
    if (body.mediaIds) await this.resolveMedia(auth, body.mediaIds, id);

    const data: Prisma.PostUpdateInput = {};
    if (body.content !== undefined) data.content = body.content;
    if (body.hashtags !== undefined) data.hashtags = body.hashtags;
    if (body.scheduledAt !== undefined) {
      data.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
    }

    if (body.targetAccountIds) {
      const accounts = await this.assertAccounts(auth, body.targetAccountIds);
      const byId = new Map(accounts.map((a) => [a.id, a]));
      await this.prisma.$transaction(async (tx) => {
        await tx.post.update({ where: { id: post.id }, data });
        await tx.postTarget.deleteMany({ where: { postId: post.id } });
        if (body.targetAccountIds!.length) {
          await tx.postTarget.createMany({
            data: body.targetAccountIds!.map((accountId) => ({
              postId: post.id,
              accountId,
              platform: byId.get(accountId)!.platform,
              status: post.status === 'APPROVED' ? 'APPROVED' : 'PENDING_APPROVAL',
            })),
          });
        }
        if (body.mediaIds) {
          await tx.postMedia.updateMany({
            where: { id: { in: body.mediaIds }, post: { workspaceId: auth.workspaceId } },
            data: { postId: post.id },
          });
        }
        if (body.scheduledAt !== undefined && post.status === 'SCHEDULED') {
          await tx.publishingJob.updateMany({
            where: { postId: post.id, status: { in: ['PENDING', 'FAILED', 'CANCELLED'] } },
            data: {
              runAt: body.scheduledAt ? new Date(body.scheduledAt) : new Date(),
              status: 'PENDING',
              attempts: 0,
            },
          });
        }
      });
    } else {
      await this.prisma.$transaction(async (tx) => {
        await tx.post.update({ where: { id: post.id }, data });
        if (body.mediaIds) {
          await tx.postMedia.updateMany({
            where: { id: { in: body.mediaIds }, post: { workspaceId: auth.workspaceId } },
            data: { postId: post.id },
          });
        }
        if (body.scheduledAt !== undefined && post.status === 'SCHEDULED') {
          await tx.publishingJob.updateMany({
            where: { postId: post.id, status: { in: ['PENDING', 'FAILED', 'CANCELLED'] } },
            data: {
              runAt: body.scheduledAt ? new Date(body.scheduledAt) : new Date(),
              status: 'PENDING',
              attempts: 0,
            },
          });
        }
      });
    }

    await writeAudit(this.prisma, {
      workspaceId: auth.workspaceId,
      actorId: auth.userId,
      action: 'POST_UPDATED',
      entity: 'Post',
      entityId: post.id,
    });
    const updated = await this.prisma.post.findUniqueOrThrow({ where: { id: post.id }, include: INCLUDE });
    return mapPost(updated);
  }

  @Post(':id/submit')
  async submit(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    requirePermission(auth, 'post:draft');
    const post = await this.setStatus(auth, id, 'DRAFT', 'PENDING_APPROVAL');
    await this.prisma.postTarget.updateMany({ where: { postId: id }, data: { status: 'PENDING_APPROVAL' } });
    await notify(this.prisma, {
      workspaceId: auth.workspaceId,
      type: 'APPROVAL_REQUESTED',
      title: 'Approval requested',
      body: `A post was submitted for approval by ${auth.role === 'OWNER' ? 'the workspace owner' : 'a team member'}.`,
    });
    return mapPost(post);
  }

  @Post(':id/approve')
  async approve(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    requirePermission(auth, 'post:approve');
    const post = await this.setStatus(auth, id, 'PENDING_APPROVAL', 'APPROVED');
    await this.prisma.postTarget.updateMany({ where: { postId: id, status: 'PENDING_APPROVAL' }, data: { status: 'APPROVED' } });
    await writeAudit(this.prisma, {
      workspaceId: auth.workspaceId,
      actorId: auth.userId,
      action: 'POST_APPROVED',
      entity: 'Post',
      entityId: id,
    });
    return mapPost(post);
  }

  @Post(':id/schedule')
  async schedule(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(schedulePostSchema)) body: z.infer<typeof schedulePostSchema>,
  ) {
    requirePermission(auth, 'post:schedule');
    const post = await this.prisma.post.findFirst({
      where: { id, workspaceId: auth.workspaceId },
      include: { targets: true },
    });
    if (!post) throw new NotFoundException('Post not found');
    if (post.status !== 'APPROVED' && post.status !== 'SCHEDULED') {
      throw new BadRequestException('Only approved posts can be scheduled');
    }
    const runAt = new Date(body.scheduledAt);
    if (Number.isNaN(runAt.getTime()) || runAt.getTime() <= Date.now()) {
      throw new BadRequestException('Scheduled time must be in the future');
    }
    if (!post.targets.length) throw new BadRequestException('Add at least one target account before scheduling');

    const plan = await loadPlan(this.prisma, auth.workspaceId);
    await this.prisma.$transaction(async (tx) => {
      await tx.post.update({ where: { id: post.id }, data: { status: 'SCHEDULED', scheduledAt: runAt, failureReason: null } });
      await tx.postTarget.updateMany({ where: { postId: post.id }, data: { status: 'SCHEDULED', error: null } });
      for (const target of post.targets) {
        const key = `post:${post.id}:target:${target.id}`;
        const existing = await tx.publishingJob.findUnique({ where: { idempotencyKey: key } });
        if (existing) {
          await tx.publishingJob.update({
            where: { idempotencyKey: key },
            data: { status: 'PENDING', runAt, attempts: 0, lockedAt: null, lastError: null },
          });
        } else {
          await tx.publishingJob.create({
            data: {
              postId: post.id,
              targetId: target.id,
              runAt,
              driver: process.env.QUEUE_DRIVER || 'db',
              idempotencyKey: key,
            },
          });
        }
      }
    });
    await writeAudit(this.prisma, {
      workspaceId: auth.workspaceId,
      actorId: auth.userId,
      action: 'POST_SCHEDULED',
      entity: 'Post',
      entityId: post.id,
      meta: { scheduledAt: runAt.toISOString(), driver: plan.tier },
    });
    const updated = await this.prisma.post.findUniqueOrThrow({ where: { id: post.id }, include: INCLUDE });
    return mapPost(updated);
  }

  @Post(':id/publish-now')
  async publishNow(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    requirePermission(auth, 'post:schedule');
    const post = await this.prisma.post.findFirst({
      where: { id, workspaceId: auth.workspaceId },
      include: { targets: true },
    });
    if (!post) throw new NotFoundException('Post not found');
    const allowed: PostStatus[] = ['APPROVED', 'SCHEDULED', 'FAILED'];
    if (!allowed.includes(post.status as PostStatus)) {
      throw new BadRequestException('Only approved or scheduled posts can be published now');
    }
    if (!post.targets.length) throw new BadRequestException('Add at least one target account first');

    await this.prisma.$transaction(async (tx) => {
      await tx.post.update({ where: { id: post.id }, data: { status: 'PUBLISHING', failureReason: null } });
      await tx.postTarget.updateMany({
        where: { postId: post.id, status: { in: ['APPROVED', 'SCHEDULED', 'FAILED'] } },
        data: { status: 'PUBLISHING', error: null },
      });
      for (const target of post.targets) {
        const key = `post:${post.id}:target:${target.id}`;
        const existing = await tx.publishingJob.findUnique({ where: { idempotencyKey: key } });
        if (existing) {
          await tx.publishingJob.update({
            where: { idempotencyKey: key },
            data: { status: 'PENDING', runAt: new Date(), attempts: 0, lockedAt: null, lastError: null },
          });
        } else {
          await tx.publishingJob.create({
            data: {
              postId: post.id,
              targetId: target.id,
              runAt: new Date(),
              driver: process.env.QUEUE_DRIVER || 'db',
              idempotencyKey: key,
            },
          });
        }
      }
    });
    await writeAudit(this.prisma, {
      workspaceId: auth.workspaceId,
      actorId: auth.userId,
      action: 'POST_PUBLISH_NOW',
      entity: 'Post',
      entityId: post.id,
    });
    const updated = await this.prisma.post.findUniqueOrThrow({ where: { id: post.id }, include: INCLUDE });
    return mapPost(updated);
  }

  @Post(':id/cancel')
  async cancel(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    requirePermission(auth, 'post:schedule');
    const post = await this.setStatus(auth, id, undefined, 'CANCELLED', ['SCHEDULED', 'APPROVED', 'PENDING_APPROVAL', 'FAILED']);
    await this.prisma.postTarget.updateMany({ where: { postId: id, status: { notIn: ['PUBLISHED'] } }, data: { status: 'CANCELLED' } });
    await this.prisma.publishingJob.updateMany({
      where: { postId: id, status: { in: ['PENDING', 'PROCESSING', 'FAILED'] } },
      data: { status: 'CANCELLED' },
    });
    await writeAudit(this.prisma, {
      workspaceId: auth.workspaceId,
      actorId: auth.userId,
      action: 'POST_CANCELLED',
      entity: 'Post',
      entityId: id,
    });
    return mapPost(post);
  }

  @Post(':id/duplicate')
  async duplicate(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    requirePermission(auth, 'post:draft');
    const post = await this.prisma.post.findFirst({
      where: { id, workspaceId: auth.workspaceId },
      include: { media: true },
    });
    if (!post) throw new NotFoundException('Post not found');
    const copy = await this.prisma.post.create({
      data: {
        workspaceId: auth.workspaceId,
        authorId: auth.userId,
        content: post.content,
        hashtags: [...post.hashtags],
        status: 'DRAFT',
        origin: post.origin,
        media: { connect: post.media.filter((m) => m.postId === post.id).map((m) => ({ id: m.id })) },
      },
      include: INCLUDE,
    });
    await writeAudit(this.prisma, {
      workspaceId: auth.workspaceId,
      actorId: auth.userId,
      action: 'POST_DUPLICATED',
      entity: 'Post',
      entityId: copy.id,
      meta: { sourcePostId: post.id },
    });
    return mapPost(copy);
  }

  @Post(':id/retry')
  async retry(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    requirePermission(auth, 'post:schedule');
    const post = await this.prisma.post.findFirst({
      where: { id, workspaceId: auth.workspaceId },
      include: { targets: true },
    });
    if (!post) throw new NotFoundException('Post not found');
    if (post.status !== 'FAILED') throw new BadRequestException('Only failed posts can be retried');

    const failedTargets = post.targets.filter((t) => t.status === 'FAILED');
    if (!failedTargets.length) throw new BadRequestException('No failed targets to retry');

    const runAt = post.scheduledAt && post.scheduledAt > new Date() ? post.scheduledAt : new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.post.update({
        where: { id: post.id },
        data: { status: 'PUBLISHING', failureReason: null },
      });
      await tx.postTarget.updateMany({
        where: { id: { in: failedTargets.map((t) => t.id) } },
        data: { status: 'PUBLISHING', error: null },
      });
      for (const target of failedTargets) {
        const key = `post:${post.id}:target:${target.id}`;
        await tx.publishingJob.upsert({
          where: { idempotencyKey: key },
          create: {
            postId: post.id,
            targetId: target.id,
            runAt,
            driver: process.env.QUEUE_DRIVER || 'db',
            idempotencyKey: key,
          },
          update: { status: 'PENDING', runAt, attempts: 0, lockedAt: null, lastError: null },
        });
      }
    });
    await writeAudit(this.prisma, {
      workspaceId: auth.workspaceId,
      actorId: auth.userId,
      action: 'POST_RETRY',
      entity: 'Post',
      entityId: post.id,
      meta: { targets: failedTargets.length },
    });
    const updated = await this.prisma.post.findUniqueOrThrow({ where: { id: post.id }, include: INCLUDE });
    return mapPost(updated);
  }

  @Delete(':id')
  async remove(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    requirePermission(auth, 'post:delete');
    const post = await this.prisma.post.findFirst({ where: { id, workspaceId: auth.workspaceId } });
    if (!post) throw new NotFoundException('Post not found');
    if (post.status !== 'DRAFT') throw new BadRequestException('Only drafts can be deleted');
    await this.prisma.post.delete({ where: { id } });
    await writeAudit(this.prisma, {
      workspaceId: auth.workspaceId,
      actorId: auth.userId,
      action: 'POST_DELETED',
      entity: 'Post',
      entityId: id,
    });
    return;
  }

  // -------------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------------

  private async assertAccounts(auth: AuthContext, ids: string[]): Promise<SocialAccount[]> {
    if (!ids.length) return [];
    const accounts = await this.prisma.socialAccount.findMany({
      where: { id: { in: ids }, workspaceId: auth.workspaceId },
    });
    if (accounts.length !== new Set(ids).size) {
      throw new BadRequestException('One or more target accounts not found in this workspace');
    }
    return accounts;
  }

  private async resolveMedia(auth: AuthContext, ids: string[] | undefined, postId?: string) {
    if (!ids || !ids.length) return [];
    const media = await this.prisma.postMedia.findMany({
      where: { id: { in: ids }, OR: [{ post: { workspaceId: auth.workspaceId } }, { postId: null }] },
    });
    if (media.length !== new Set(ids).size) {
      throw new BadRequestException('One or more media items not found');
    }
    void postId;
    return media;
  }

  private async setStatus(
    auth: AuthContext,
    id: string,
    from: PostStatus | undefined,
    to: PostStatus,
    allowed?: PostStatus[],
  ) {
    const post = await this.prisma.post.findFirst({
      where: { id, workspaceId: auth.workspaceId },
      include: INCLUDE,
    });
    if (!post) throw new NotFoundException('Post not found');
    if (allowed ? !allowed.includes(post.status as PostStatus) : post.status !== from) {
      throw new BadRequestException(
        allowed
          ? `Cannot ${to.toLowerCase()} a post in status ${post.status}`
          : `Post must be ${from} to transition to ${to}`,
      );
    }
    await this.prisma.post.update({ where: { id: post.id }, data: { status: to } });
    return { ...post, status: to };
  }
}

@Module({
  imports: [PrismaModule],
  controllers: [PostsController],
})
export class PostsModule {}
