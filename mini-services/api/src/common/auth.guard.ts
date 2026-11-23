import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from './prisma.module';
import { ROLE_PERMISSIONS, type Permission, type UserRole } from '@smm/shared';

export interface AuthContext {
  userId: string;
  workspaceId: string;
  role: UserRole;
  permissions: Permission[];
}

export const SESSION_COOKIE = 'smm_session';

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const token: string | undefined = req.cookies?.[SESSION_COOKIE];
    if (!token) throw new UnauthorizedException('Not authenticated');

    let payload: { sub?: string; wsId?: string };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Session expired');
    }
    if (!payload.sub || !payload.wsId) throw new UnauthorizedException('Invalid session');

    const member = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: payload.wsId, userId: payload.sub } },
    });
    if (!member || member.status !== 'ACTIVE') throw new UnauthorizedException('Workspace access revoked');

    req.auth = {
      userId: payload.sub,
      workspaceId: payload.wsId,
      role: member.role,
      permissions: ROLE_PERMISSIONS[member.role],
    };
    return true;
  }
}

/** Throws unless the authenticated role holds the given permission. */
export function requirePermission(auth: AuthContext | undefined, permission: Permission): AuthContext {
  if (!auth) throw new UnauthorizedException('Not authenticated');
  if (!auth.permissions.includes(permission)) {
    throw new ForbiddenException(`Missing permission: ${permission}`);
  }
  return auth;
}
