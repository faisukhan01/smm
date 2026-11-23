import { Controller, Get, Module } from '@nestjs/common';

@Controller('billing')
export class BillingController {
  @Get()
  placeholder() {
    return { status: 'NOT_IMPLEMENTED', module: 'billing' };
  }
}

@Module({ controllers: [BillingController] })
export class BillingModule {}
