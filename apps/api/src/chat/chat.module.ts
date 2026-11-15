import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import type { Env } from '../config/env.js';
import { uploadOptions } from '../files/uploads.js';
import { ChatController, ClientChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';

@Module({
  imports: [MulterModule.registerAsync({ inject: [ConfigService], useFactory: (config: ConfigService<Env, true>) => uploadOptions(config) })],
  controllers: [ChatController, ClientChatController],
  providers: [ChatService],
})
export class ChatModule {}
