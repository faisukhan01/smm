import { Controller, Get, Module } from '@nestjs/common';

@Controller('inbox')
export class InboxController {
  @Get()
  placeholder() {
    return { status: 'NOT_IMPLEMENTED', module: 'inbox' };
  }
}

@Module({ controllers: [InboxController] })
export class InboxModule {}
