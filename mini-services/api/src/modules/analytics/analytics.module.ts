import { Controller, Get, Module } from '@nestjs/common';

@Controller('analytics')
export class AnalyticsController {
  @Get()
  placeholder() {
    return { status: 'NOT_IMPLEMENTED', module: 'analytics' };
  }
}

@Module({ controllers: [AnalyticsController] })
export class AnalyticsModule {}
