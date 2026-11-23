import { z } from 'zod';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PLATFORMS, type MediaDTO, type Platform } from '@smm/shared';
import { AuthGuard, requirePermission, type AuthContext } from '../../common/auth.guard';
import { CurrentAuth } from '../../common/current-auth.decorator';
import { PrismaService } from '../../common/prisma.module';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { writeAudit } from '../../common/audit';
import { extForMime, mediaUrl, saveUpload } from '../../common/uploads';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const uploadMediaSchema = z.object({
  base64: z.string().min(1),
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'video/mp4']),
  altText: z.string().max(500).optional(),
});

type UploadMediaInput = z.infer<typeof uploadMediaSchema>;

@Controller('media')
@UseGuards(AuthGuard)
export class MediaController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  async upload(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(uploadMediaSchema)) body: UploadMediaInput,
  ): Promise<MediaDTO> {
    requirePermission(auth, 'post:draft');
    const buffer = Buffer.from(body.base64, 'base64');
    if (!buffer.length) throw new BadRequestException('Invalid file data');
    if (buffer.length > MAX_UPLOAD_BYTES) {
      throw new BadRequestException('File too large (max 5MB)');
    }

    const filename = await saveUpload(buffer, extForMime(body.mimeType));
    const media = await this.prisma.postMedia.create({
      // Unattached until linked to a post (postId is nullable).
      data: {
        postId: null,
        type: body.mimeType === 'video/mp4' ? 'VIDEO' : 'IMAGE',
        provider: 'UPLOADED',
        url: mediaUrl(filename),
        storageKey: filename,
        mimeType: body.mimeType,
        size: buffer.length,
        altText: body.altText ?? null,
      },
    });
    return toMediaDTO(media);
  }

  @Get()
  async list(@CurrentAuth() auth: AuthContext, @Query('postId') postId?: string) {
    requirePermission(auth, 'post:read');
    if (!postId) return { items: [] as MediaDTO[] };
    const post = await this.prisma.post.findFirst({
      where: { id: postId, workspaceId: auth.workspaceId },
      select: { id: true },
    });
    if (!post) throw new NotFoundException('Not found');
    const items = await this.prisma.postMedia.findMany({
      where: { postId },
      orderBy: { createdAt: 'asc' },
    });
    return { items: items.map(toMediaDTO) };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentAuth() auth: AuthContext, @Param('id') id: string): Promise<void> {
    requirePermission(auth, 'post:draft');
    const media = await this.prisma.postMedia.findFirst({
      where: { id },
      include: { post: { select: { workspaceId: true } } },
    });
    if (!media) throw new NotFoundException('Not found');
    // Attached media is scoped through its post; unattached media may be cleaned up freely.
    if (media.post && media.post.workspaceId !== auth.workspaceId) {
      throw new NotFoundException('Not found');
    }

    try {
      await unlink(join(uploadDirPath(), media.storageKey));
    } catch {
      // File already gone or stored remotely — the row is still removed.
    }
    await this.prisma.postMedia.delete({ where: { id: media.id } });
    await writeAudit(this.prisma, {
      workspaceId: auth.workspaceId,
      actorId: auth.userId,
      action: 'MEDIA_DELETED',
      entity: 'PostMedia',
      entityId: media.id,
      meta: { storageKey: media.storageKey },
    });
  }
}

type MediaRow = {
  id: string;
  type: 'IMAGE' | 'VIDEO';
  provider: 'GENERATED' | 'UPLOADED';
  url: string;
  aspectRatio: string | null;
  altText: string | null;
};

function toMediaDTO(media: MediaRow): MediaDTO {
  return {
    id: media.id,
    type: media.type,
    url: media.url,
    aspectRatio: media.aspectRatio ?? null,
    altText: media.altText ?? null,
    provider: media.provider,
  };
}

function uploadDirPath(): string {
  return process.env.UPLOAD_DIR || './uploads';
}

// PLATFORMS import is used only for typing parity with shared enums.
void (PLATFORMS as readonly Platform[]);
