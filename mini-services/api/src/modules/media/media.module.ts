import { Controller, Get, Module } from '@nestjs/common';

@Controller('media')
export class MediaController {
  @Get()
  placeholder() {
    return { status: 'NOT_IMPLEMENTED', module: 'media' };
  }
}

@Module({ controllers: [MediaController] })
export class MediaModule {}
