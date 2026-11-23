import { Controller, Get, Module } from '@nestjs/common';

@Controller('ai')
export class AiController {
  @Get()
  placeholder() {
    return { status: 'NOT_IMPLEMENTED', module: 'ai' };
  }
}

@Module({ controllers: [AiController] })
export class AiModule {}
