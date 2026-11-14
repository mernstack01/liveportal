import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot, InlineKeyboard } from 'grammy';
import { NOT_INVITED_MESSAGE } from '../auth/auth.service.js';
import type { Env } from '../config/env.js';
import { PrismaService } from '../db/prisma.service.js';
import { INVITE_PREFIX } from '../invites/invite-record.js';
import { InviteError, InvitesService, type InviteErrorCode } from '../invites/invites.service.js';

const INVITE_ERRORS: Record<InviteErrorCode, string> = {
  not_found: 'Taklif havolasi noto‘g‘ri. Uni sizga yuborgan odamdan qayta so‘rang.',
  used: 'Bu havola allaqachon ishlatilgan. Har bir odam uchun alohida havola beriladi.',
  expired: 'Havolaning muddati tugagan. Yangisini so‘rang.',
};

/**
 * Telegram bot (grammY). MVP'da API process ichida ishlaydi (docs/09).
 * Lokal: BOT_MODE=polling. Production uchun webhook keyin qo'shiladi.
 */
@Injectable()
export class BotService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(BotService.name);
  private bot?: Bot;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
    private readonly invites: InvitesService,
  ) {}

  onApplicationBootstrap(): void {
    const token = this.config.get('TELEGRAM_BOT_TOKEN', { infer: true });
    const mode = this.config.get('BOT_MODE', { infer: true });
    if (mode === 'off' || !token) {
      this.logger.warn(`Bot o‘chiq (BOT_MODE=${mode}${token ? '' : ', TELEGRAM_BOT_TOKEN yo‘q'})`);
      return;
    }

    const bot = new Bot(token);
    this.register(bot);
    bot.catch((err) => this.logger.error(`Bot xatosi: ${err.message}`, err.error instanceof Error ? err.error.stack : undefined));
    this.bot = bot;

    bot
      .start({
        drop_pending_updates: false,
        onStart: (info) => {
          this.logger.log(`Bot ishga tushdi: @${info.username} (polling)`);
          const expected = this.config.get('TELEGRAM_BOT_USERNAME', { infer: true });
          if (expected && expected.toLowerCase() !== info.username.toLowerCase()) {
            this.logger.warn(`TELEGRAM_BOT_USERNAME=${expected}, lekin token @${info.username} botiga tegishli`);
          }
        },
      })
      .catch((error: unknown) => this.logger.error(`Bot ishga tushmadi: ${String(error)}`));
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.bot?.isRunning()) await this.bot.stop();
  }

  private register(bot: Bot): void {
    const privateChat = bot.chatType('private');

    privateChat.command('start', async (ctx) => {
      const payload = ctx.match.trim();
      const from = ctx.from;

      if (payload.startsWith(INVITE_PREFIX)) {
        try {
          const accepted = await this.invites.accept(payload.slice(INVITE_PREFIX.length), from);
          await ctx.reply(
            `Xush kelibsiz, ${accepted.userName}!\n\nSiz «${accepted.workspaceName}» ga «${accepted.role}» sifatida qo‘shildingiz. ` +
              `Endi tasklar va eslatmalar shu yerga keladi.\n\nPortal: ${this.webOrigin()}`,
            { reply_markup: this.portalKeyboard() },
          );
        } catch (error) {
          if (error instanceof InviteError) {
            await ctx.reply(INVITE_ERRORS[error.code]);
            return;
          }
          throw error;
        }
        return;
      }

      const user = await this.prisma.user.findUnique({ where: { telegramId: BigInt(from.id) } });
      if (!user) {
        await ctx.reply(NOT_INVITED_MESSAGE);
        return;
      }
      await ctx.reply(`Salom, ${user.name}! Portal: ${this.webOrigin()}`, { reply_markup: this.portalKeyboard() });
    });

    privateChat.command('help', (ctx) =>
      ctx.reply('Buyruqlar:\n/start — portal havolasi\n/help — yordam\n\nTez orada: /mytasks, /today'),
    );
  }

  private webOrigin(): string {
    return this.config.get('WEB_ORIGIN', { infer: true });
  }

  /** Telegram faqat https manzilli tugmalarni qabul qiladi; lokalda tugma chiqmaydi. */
  private portalKeyboard(): InlineKeyboard | undefined {
    const url = this.webOrigin();
    return url.startsWith('https://') ? new InlineKeyboard().webApp('Portalni ochish', url) : undefined;
  }
}
