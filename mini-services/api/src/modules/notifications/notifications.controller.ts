import { Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard, requirePermission, type AuthContext } from '../../common/auth.guard';
import { CurrentAuth } from '../../common/current-auth.decorator';
import { PrismaService } from '../../common/prisma.module';

@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentAuth() auth: AuthContext) {
    requirePermission(auth, 'workspace:read');
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { workspaceId: auth.workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.notification.count({ where: { workspaceId: auth.workspaceId, read: false } }),
    ]);
    return { items, unread };
  }

  @Post('read-all')
  @HttpCode(204)
  async readAll(@CurrentAuth() auth: AuthContext): Promise<void> {
    requirePermission(auth, 'workspace:read');
    await this.prisma.notification.updateMany({
      where: { workspaceId: auth.workspaceId, read: false },
      data: { read: true },
    });
  }

  @Post(':id/read')
  @HttpCode(204)
  async readOne(@CurrentAuth() auth: AuthContext, @Param('id') id: string): Promise<void> {
    requirePermission(auth, 'workspace:read');
    const notification = await this.prisma.notification.findFirst({
      where: { id, workspaceId: auth.workspaceId },
    });
    if (!notification) return;
    await this.prisma.notification.update({ where: { id: notification.id }, data: { read: true } });
  }
}
