import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import type { Env } from '../config/env.js';
import { ChatController, ClientChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';

export const MAX_FILES = 10;

@Module({
  imports: [
    // Fayllar to'g'ridan-to'g'ri diskka, tasodifiy nom bilan (asl nom faqat bazada).
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const dir = resolve(config.get('UPLOAD_DIR', { infer: true }));
        mkdirSync(dir, { recursive: true });
        return {
          storage: diskStorage({ destination: dir, filename: (_req, _file, cb) => cb(null, randomBytes(16).toString('hex')) }),
          limits: { fileSize: config.get('MAX_UPLOAD_MB', { infer: true }) * 1024 * 1024, files: MAX_FILES },
          // O'zbekcha/ruscha fayl nomlari buzilmasligi uchun.
          defParamCharset: 'utf8',
        };
      },
    }),
  ],
  controllers: [ChatController, ClientChatController],
  providers: [ChatService],
})
export class ChatModule {}
