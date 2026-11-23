import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard, requirePermission, type AuthContext } from '../../common/auth.guard';
import { CurrentAuth } from '../../common/current-auth.decorator';
import { PrismaService } from '../../common/prisma.module';
import { clampInt, parsePositiveInt } from '../../common/parse';

@Controller('audit')
@UseGuards(AuthGuard)
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentAuth() auth: AuthContext, @Query() query: Record<string, string>) {
    requirePermission(auth, 'audit:read');
    const page = clampInt(parsePositiveInt(query.page, 1), 1, 10_000);
    const pageSize = clampInt(parsePositiveInt(query.pageSize, 25), 1, 100);
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { workspaceId: auth.workspaceId },
        include: { actor: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where: { workspaceId: auth.workspaceId } }),
    ]);
    return {
      items: items.map((log) => ({
        id: log.id,
        action: log.action,
        entity: log.entity,
        entityId: log.entityId,
        actorName: log.actor?.name ?? null,
        createdAt: log.createdAt,
        meta: log.meta,
      })),
      total,
      page,
      pageSize,
    };
  }
}
