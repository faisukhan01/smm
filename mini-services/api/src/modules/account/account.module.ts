import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma.module';
import { AccountController } from './account.controller';

@Module({
  imports: [PrismaModule],
  controllers: [AccountController],
})
export class AccountModule {}
