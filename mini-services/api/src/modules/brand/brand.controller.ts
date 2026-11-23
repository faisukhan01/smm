import { Controller, Get, Put, UseGuards } from '@nestjs/common';
import { brandSchema, type BrandInput } from '@smm/shared';
import { AuthGuard, requirePermission, type AuthContext } from '../../common/auth.guard';
import { CurrentAuth } from '../../common/current-auth.decorator';
import { PrismaService } from '../../common/prisma.module';
import { writeAudit } from '../../common/audit';
import { ZodValidationPipe } from '../../common/zod.pipe';

@Controller('brand')
@UseGuards(AuthGuard)
export class BrandController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get(@CurrentAuth() auth: AuthContext) {
    requirePermission(auth, 'brand:read');
    // Nullable by design: the UI treats a missing profile as "not configured yet".
    return this.prisma.brandProfile.findUnique({ where: { workspaceId: auth.workspaceId } });
  }

  @Put()
  async update(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(brandSchema)) body: BrandInput,
  ) {
    requirePermission(auth, 'brand:write');
    const profile = await this.prisma.brandProfile.upsert({
      where: { workspaceId: auth.workspaceId },
      create: { workspaceId: auth.workspaceId, ...body },
      update: { ...body },
    });
    await writeAudit(this.prisma, {
      workspaceId: auth.workspaceId,
      actorId: auth.userId,
      action: 'BRAND_UPDATED',
      entity: 'BrandProfile',
      entityId: profile.id,
    });
    return profile;
  }
}
