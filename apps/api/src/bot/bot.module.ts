import { Module } from '@nestjs/common';
import { InvitesModule } from '../invites/invites.module.js';
import { BotService } from './bot.service.js';

@Module({
  imports: [InvitesModule],
  providers: [BotService],
})
export class BotModule {}
