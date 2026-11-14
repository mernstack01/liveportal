import { Module } from '@nestjs/common';
import { InvitesModule } from '../invites/invites.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { BotService } from './bot.service.js';

@Module({
  imports: [InvitesModule, TasksModule],
  providers: [BotService],
})
export class BotModule {}
