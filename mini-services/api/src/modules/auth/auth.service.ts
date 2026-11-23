import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../common/prisma.module';
import { hashPassword, verifyPassword } from '../../common/password';
import { ROLE_PERMISSIONS, type PlanTier, type SessionPayload, type UserRole } from '@smm/shared';

const SESSION_DAYS = 7;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(input: { name: string; email: string; password: string }): Promise<SessionPayload> {
    const email = input.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('An account with this email already exists');

    const user = await this.prisma.user.create({
      data: {
        email,
        name: input.name.trim(),
        passwordHash: hashPassword(input.password),
        verifyToken: crypto.randomUUID(),
      },
    });

    const workspace = await this.createOwnedWorkspace(user.id, `${input.name.trim().split(' ')[0] || 'My'} Workspace`);
    return this.buildSession(user.id, workspace.id);
  }

  async login(input: { email: string; password: string }): Promise<SessionPayload> {
    const email = input.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { memberships: { where: { status: 'ACTIVE' }, take: 1 } },
    });
    if (!user || !verifyPassword(input.password, user.passwordHash)) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const workspaceId = user.memberships[0]?.workspaceId;
    if (!workspaceId) throw new UnauthorizedException('No active workspace');
    return this.buildSession(user.id, workspaceId);
  }

  /** Switch the active workspace (multi-workspace users: AGENCY plan). */
  async switchWorkspace(userId: string, workspaceId: string): Promise<SessionPayload> {
    const member = await this.prisma.workspaceMember.findFirst({
      where: { userId, workspaceId, status: 'ACTIVE' },
    });
    if (!member) throw new BadRequestException('Not a member of this workspace');
    return this.buildSession(userId, workspaceId);
  }

  async verifyEmail(token: string): Promise<{ verified: boolean }> {
    const user = await this.prisma.user.findFirst({ where: { verifyToken: token } });
    if (!user) throw new BadRequestException('Invalid or expired verification token');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, verifyToken: null },
    });
    return { verified: true };
  }

  private async createOwnedWorkspace(ownerId: string, name: string) {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'workspace';
    const slug = `${base}-${crypto.randomUUID().slice(0, 8)}`;
    return this.prisma.$transaction(async (tx) => {
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

  async buildSession(userId: string, workspaceId: string): Promise<SessionPayload> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const membership = await this.prisma.workspaceMember.findUniqueOrThrow({
      where: { workspaceId_userId: { workspaceId, userId } },
      include: { workspace: { include: { subscription: true } } },
    });
    const role = membership.role as UserRole;
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified,
      },
      workspace: {
        id: membership.workspace.id,
        name: membership.workspace.name,
        slug: membership.workspace.slug,
        plan: (membership.workspace.subscription?.plan ?? 'FREE') as PlanTier,
      },
      role,
      permissions: ROLE_PERMISSIONS[role],
    };
  }
}
