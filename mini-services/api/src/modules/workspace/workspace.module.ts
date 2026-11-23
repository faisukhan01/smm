import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma.module';
import { WorkspaceController } from './workspace.controller';

@Module({
  imports: [PrismaModule],
  controllers: [WorkspaceController],
})
export class WorkspaceModule {}
