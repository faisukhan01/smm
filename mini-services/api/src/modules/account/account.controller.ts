import { z } from 'zod';
import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard, requirePermission, type AuthContext } from '../../common/auth.guard';
import { CurrentAuth } from '../../common/current-auth.decorator';
import { PrismaService } from '../../common/prisma.module';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { hashPassword, verifyPassword } from '../../common/password';

const updateAccountSchema = z.object({
  name: z.string().min(2).max(80),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(100),
});

type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

@Controller('account')
@UseGuards(AuthGuard)
export class AccountController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get(@CurrentAuth() auth: AuthContext) {
    requirePermission(auth, 'workspace:read');
    const user = await this.prisma.user.findUnique({ where: { id: auth.userId } });
    if (!user) throw new NotFoundException('Not found');
    return { id: user.id, email: user.email, name: user.name, emailVerified: user.emailVerified };
  }

  @Patch()
  async update(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(updateAccountSchema)) body: UpdateAccountInput,
  ) {
    requirePermission(auth, 'workspace:read');
    const user = await this.prisma.user.update({
      where: { id: auth.userId },
      data: { name: body.name.trim() },
    });
    return { id: user.id, email: user.email, name: user.name, emailVerified: user.emailVerified };
  }

  @Post('password')
  @HttpCode(204)
  async changePassword(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
  ): Promise<void> {
    requirePermission(auth, 'workspace:read');
    const user = await this.prisma.user.findUnique({ where: { id: auth.userId } });
    if (!user) throw new NotFoundException('Not found');
    if (!verifyPassword(body.currentPassword, user.passwordHash)) {
      throw new BadRequestException('Current password is incorrect');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(body.newPassword) },
    });
  }
}
