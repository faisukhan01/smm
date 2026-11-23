import { z } from 'zod';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { inviteSchema } from '@smm/shared';
import { AuthGuard, requirePermission, type AuthContext } from '../../common/auth.guard';
import { CurrentAuth } from '../../common/current-auth.decorator';
import { PrismaService } from '../../common/prisma.module';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { writeAudit } from '../../common/audit';
import { notify } from '../../common/notify';
import { assertQuota } from '../../common/plans';
import type { UserRole, WorkspaceMember } from '@prisma/client';

const updateWorkspaceSchema = z.object({
  name: z.string().min(2).max(80),
});

const revokeInviteSchema = z.object({
  status: z.literal('REVOKED'),
});

const memberRoleSchema = z.object({
  role: z.enum(['ADMIN', 'MANAGER', 'EDITOR', 'VIEWER']),
});

type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;

@Controller('workspace')
@UseGuards(AuthGuard)
export class WorkspaceController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get(@CurrentAuth() auth: AuthContext) {
    requirePermission(auth, 'workspace:read');
    const workspace = await this.prisma.workspace.findUnique({ where: { id: auth.workspaceId } });
    if (!workspace) throw new NotFoundException('Not found');
    const [members, invites] = await Promise.all([
      this.prisma.workspaceMember.findMany({
        where: { workspaceId: workspace.id },
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.invite.findMany({
        where: { workspaceId: workspace.id, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug, createdAt: workspace.createdAt },
      members: members.map((m) => toMemberDTO(m)),
      invites: invites.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        status: i.status,
        expiresAt: i.expiresAt,
      })),
    };
  }

  @Patch()
  async update(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(updateWorkspaceSchema)) body: UpdateWorkspaceInput,
  ) {
    requirePermission(auth, 'workspace:update');
    const workspace = await this.prisma.workspace.update({
      where: { id: auth.workspaceId },
      data: { name: body.name.trim() },
    });
    await writeAudit(this.prisma, {
      workspaceId: auth.workspaceId,
      actorId: auth.userId,
      action: 'WORKSPACE_UPDATED',
      entity: 'Workspace',
      entityId: workspace.id,
      meta: { name: workspace.name },
    });
    return { id: workspace.id, name: workspace.name, slug: workspace.slug, createdAt: workspace.createdAt };
  }

  @Post('invites')
  async createInvite(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(inviteSchema)) body: z.infer<typeof inviteSchema>,
  ) {
    requirePermission(auth, 'team:manage');
    const [memberCount, pendingInvites] = await Promise.all([
      this.prisma.workspaceMember.count({ where: { workspaceId: auth.workspaceId, status: 'ACTIVE' } }),
      this.prisma.invite.count({ where: { workspaceId: auth.workspaceId, status: 'PENDING' } }),
    ]);
    await assertQuota(this.prisma, auth.workspaceId, 'members', memberCount + pendingInvites);

    const email = body.email.toLowerCase().trim();
    const existingMember = await this.prisma.workspaceMember.findFirst({
      where: { workspaceId: auth.workspaceId, user: { email } },
    });
    if (existingMember) throw new ConflictException('This person is already a member of the workspace');
    const existingInvite = await this.prisma.invite.findFirst({
      where: { workspaceId: auth.workspaceId, email, status: 'PENDING' },
    });
    if (existingInvite) throw new ConflictException('An invite for this email is already pending');

    const invite = await this.prisma.invite.create({
      data: {
        workspaceId: auth.workspaceId,
        email,
        role: body.role,
        invitedById: auth.userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    await writeAudit(this.prisma, {
      workspaceId: auth.workspaceId,
      actorId: auth.userId,
      action: 'INVITE_CREATED',
      entity: 'Invite',
      entityId: invite.id,
      meta: { email, role: invite.role },
    });
    await notify(this.prisma, {
      workspaceId: auth.workspaceId,
      type: 'INVITE_CREATED',
      title: 'Team invite sent',
      body: `${email} was invited as ${body.role.toLowerCase()}.`,
    });
    return {
      invite: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        status: invite.status,
        expiresAt: invite.expiresAt,
      },
      note: 'Email delivery is not configured — share the invite manually for now.',
    };
  }

  @Delete('invites/:id')
  @HttpCode(204)
  async revokeInvite(@CurrentAuth() auth: AuthContext, @Param('id') id: string): Promise<void> {
    requirePermission(auth, 'team:manage');
    await this.revoke(auth, id);
  }

  /** Fallback revoke route (some clients cannot issue DELETE). */
  @Patch('invites/:id')
  @HttpCode(204)
  async revokeInviteFallback(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(revokeInviteSchema)) _body: { status: 'REVOKED' },
  ): Promise<void> {
    requirePermission(auth, 'team:manage');
    await this.revoke(auth, id);
  }

  @Patch('members/:memberId')
  async updateMemberRole(
    @CurrentAuth() auth: AuthContext,
    @Param('memberId') memberId: string,
    @Body(new ZodValidationPipe(memberRoleSchema)) body: { role: 'ADMIN' | 'MANAGER' | 'EDITOR' | 'VIEWER' },
  ) {
    requirePermission(auth, 'team:manage');
    const member = await this.findMember(auth, memberId);
    if (member.role === 'OWNER') {
      throw new BadRequestException('The workspace owner role cannot be changed');
    }
    const previousRole = member.role;
    const updated = await this.prisma.workspaceMember.update({
      where: { id: member.id },
      data: { role: body.role },
      include: { user: { select: { name: true, email: true } } },
    });
    await writeAudit(this.prisma, {
      workspaceId: auth.workspaceId,
      actorId: auth.userId,
      action: 'MEMBER_ROLE_CHANGED',
      entity: 'WorkspaceMember',
      entityId: updated.id,
      meta: { userId: updated.userId, from: previousRole, to: body.role },
    });
    return toMemberDTO(updated);
  }

  @Delete('members/:memberId')
  @HttpCode(204)
  async removeMember(@CurrentAuth() auth: AuthContext, @Param('memberId') memberId: string): Promise<void> {
    requirePermission(auth, 'team:manage');
    const member = await this.findMember(auth, memberId);
    if (member.role === 'OWNER') throw new BadRequestException('The workspace owner cannot be removed');
    if (member.userId === auth.userId) throw new BadRequestException('You cannot remove yourself');
    await this.prisma.workspaceMember.delete({ where: { id: member.id } });
    await writeAudit(this.prisma, {
      workspaceId: auth.workspaceId,
      actorId: auth.userId,
      action: 'MEMBER_REMOVED',
      entity: 'WorkspaceMember',
      entityId: member.id,
      meta: { userId: member.userId, role: member.role },
    });
  }

  private async findMember(auth: AuthContext, memberId: string) {
    const member = await this.prisma.workspaceMember.findFirst({
      where: { id: memberId, workspaceId: auth.workspaceId },
    });
    if (!member) throw new NotFoundException('Not found');
    return member;
  }

  private async revoke(auth: AuthContext, id: string): Promise<void> {
    const invite = await this.prisma.invite.findFirst({
      where: { id, workspaceId: auth.workspaceId },
    });
    if (!invite) throw new NotFoundException('Not found');
    if (invite.status === 'PENDING') {
      await this.prisma.invite.update({ where: { id: invite.id }, data: { status: 'REVOKED' } });
      await writeAudit(this.prisma, {
        workspaceId: auth.workspaceId,
        actorId: auth.userId,
        action: 'INVITE_REVOKED',
        entity: 'Invite',
        entityId: invite.id,
        meta: { email: invite.email },
      });
    }
  }
}

type MemberWithUser = WorkspaceMember & { user: { name: string; email: string } };

function toMemberDTO(member: MemberWithUser) {
  return {
    id: member.id,
    userId: member.userId,
    name: member.user.name,
    email: member.user.email,
    role: member.role as UserRole,
    status: member.status,
    createdAt: member.createdAt,
  };
}
