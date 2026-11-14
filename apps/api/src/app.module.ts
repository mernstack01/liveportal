import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { BotModule } from './bot/bot.module.js';
import { validateEnv } from './config/env.js';
import { DatabaseModule } from './db/database.module.js';
import { HealthController } from './health/health.controller.js';
import { InvitesModule } from './invites/invites.module.js';
import { ProjectsModule } from './projects/projects.module.js';
import { WorkspaceModule } from './workspace/workspace.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DatabaseModule,
    AuthModule,
    InvitesModule,
    WorkspaceModule,
    ProjectsModule,
    BotModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
