import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma.module';
import { BrandController } from './brand.controller';

@Module({
  imports: [PrismaModule],
  controllers: [BrandController],
})
export class BrandModule {}
