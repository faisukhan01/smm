import { Controller, Get, Module } from '@nestjs/common';

@Controller('accounts')
export class AccountsController {
  @Get()
  placeholder() {
    return { status: 'NOT_IMPLEMENTED', module: 'accounts' };
  }
}

@Module({ controllers: [AccountsController] })
export class AccountsModule {}
