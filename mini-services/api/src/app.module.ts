import { Module } from '@nestjs/common';
import { PrismaModule } from './common/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
// Domain modules (workspace, brand, accounts, posts, media, ai, inbox,
// analytics, billing, notifications, audit, oauth) are registered here
// as they are implemented.
import { WorkspaceModule } from './modules/workspace/workspace.module';
import { BrandModule } from './modules/brand/brand.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { PostsModule } from './modules/posts/posts.module';
import { MediaModule } from './modules/media/media.module';
import { AiModule } from './modules/ai/ai.module';
import { InboxModule } from './modules/inbox/inbox.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { BillingModule } from './modules/billing/billing.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuditModule } from './modules/audit/audit.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    WorkspaceModule,
    BrandModule,
    AccountsModule,
    PostsModule,
    MediaModule,
    AiModule,
    InboxModule,
    AnalyticsModule,
    BillingModule,
    NotificationsModule,
    AuditModule,
  ],
})
export class AppModule {}
