import { Module } from '@nestjs/common';
import { NotificationRules } from './notification-rules.js';
import { NotificationSender } from './notification.sender.js';
import { GrammyTelegramGateway, TelegramGateway } from './telegram.gateway.js';

@Module({
  providers: [NotificationRules, NotificationSender, { provide: TelegramGateway, useClass: GrammyTelegramGateway }],
  exports: [NotificationSender],
})
export class NotificationsModule {}
