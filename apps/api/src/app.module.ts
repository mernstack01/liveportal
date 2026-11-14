import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { BotModule } from './bot/bot.module.js';
import { validateEnv } from './config/env.js';
import { ChatModule } from './chat/chat.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { DatabaseModule } from './db/database.module.js';
import { EventsModule } from './events/events.module.js';
import { HealthController } from './health/health.controller.js';
import { InvitesModule } from './invites/invites.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { ProjectsModule } from './projects/projects.module.js';
import { RolesModule } from './roles/roles.module.js';
import { SchedulerModule } from './scheduler/scheduler.module.js';
import { TasksModule } from './tasks/tasks.module.js';
import { WorkspaceModule } from './workspace/workspace.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DatabaseModule,
    EventsModule,
    AuthModule,
    InvitesModule,
    WorkspaceModule,
    RolesModule,
    ProjectsModule,
    TasksModule,
    NotificationsModule,
    SchedulerModule,
    DashboardModule,
    ChatModule,
    BotModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
