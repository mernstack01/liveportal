import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DealsModule } from '../deals/deals.module.js';
import { InvitesModule } from '../invites/invites.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { BotService } from './bot.service.js';

@Module({
  imports: [AuthModule, DealsModule, InvitesModule, TasksModule],
  providers: [BotService],
})
export class BotModule {}
