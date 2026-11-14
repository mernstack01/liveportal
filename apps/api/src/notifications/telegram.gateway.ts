import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Api, GrammyError, InlineKeyboard } from 'grammy';
import type { Env } from '../config/env.js';
import type { RenderedMessage } from './notification-message.js';

/** Qayta urinish foydasiz: bot bloklangan, chat yo'q, token yo'q. */
export class TelegramPermanentError extends Error {}

/** Telegram 429: shuncha soniyadan keyin qayta urinish kerak. */
export class TelegramRetryAfterError extends Error {
  constructor(readonly seconds: number) {
    super(`Telegram ${seconds}s kutishni so‘radi`);
  }
}

/** Testlarda soxtasi bilan almashtiriladi (`overrideProvider(TelegramGateway)`). */
export abstract class TelegramGateway {
  abstract send(chatId: string, message: RenderedMessage): Promise<void>;
}

@Injectable()
export class GrammyTelegramGateway extends TelegramGateway {
  private readonly api?: Api;

  constructor(config: ConfigService<Env, true>) {
    super();
    const token = config.get('TELEGRAM_BOT_TOKEN', { infer: true });
    if (token) this.api = new Api(token);
  }

  async send(chatId: string, message: RenderedMessage): Promise<void> {
    if (!this.api) throw new TelegramPermanentError('TELEGRAM_BOT_TOKEN yo‘q');
    const keyboard = new InlineKeyboard();
    for (const row of message.buttons) {
      for (const b of row) {
        if ('callbackData' in b) keyboard.text(b.text, b.callbackData);
        else keyboard.webApp(b.text, b.webAppUrl);
      }
      keyboard.row();
    }
    try {
      await this.api.sendMessage(chatId, message.text, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        reply_markup: message.buttons.length > 0 ? keyboard : undefined,
      });
    } catch (error) {
      if (error instanceof GrammyError) {
        if (error.error_code === 429) throw new TelegramRetryAfterError(error.parameters.retry_after ?? 30);
        // 403: bot bloklangan yoki odam botni ishga tushirmagan; 400: chat yo'q yoki xabar noto'g'ri.
        if (error.error_code === 403 || error.error_code === 400) throw new TelegramPermanentError(error.description);
      }
      throw error;
    }
  }
}
