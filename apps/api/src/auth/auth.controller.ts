import { Body, Controller, Get, Headers, HttpCode, NotFoundException, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { z } from 'zod';
import { parse } from '../common/zod.js';
import type { Env } from '../config/env.js';
import { AuthService, type IssuedTokens } from './auth.service.js';
import type { AppRequest, AuthUser } from './auth.types.js';
import { CurrentUser, Public } from './decorators.js';
import { verifyLoginWidget, verifyMiniAppInitData } from './telegram-verify.js';

export const REFRESH_COOKIE = 'lp_refresh';
const onboardingSchema = z.object({ tour: z.string().regex(/^[a-z0-9-]{1,40}$/, 'Yo‘riqnoma nomi noto‘g‘ri') });
const COOKIE_PATH = '/api/v1/auth';

const miniAppSchema = z.object({ initData: z.string().min(1).max(4096) });
const devLoginSchema = z.object({ telegramId: z.coerce.number().int().positive() });

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Web: Telegram Login Widget qaytargan obyekt to'liq yuboriladi. */
  @Public()
  @Post('telegram/widget')
  @HttpCode(200)
  async widget(@Body() body: unknown, @Headers('user-agent') ua: string | undefined, @Res({ passthrough: true }) res: Response) {
    const data = parse(z.record(z.string(), z.unknown()), body);
    const tg = verifyLoginWidget(data, this.botToken(), this.maxAge());
    if (!tg) throw new UnauthorizedException('Telegram imzosi noto‘g‘ri yoki eskirgan');
    return this.respond(res, await this.auth.loginWithTelegram(tg, ua));
  }

  /** Telegram Mini App: `Telegram.WebApp.initData` satri. */
  @Public()
  @Post('telegram/mini-app')
  @HttpCode(200)
  async miniApp(@Body() body: unknown, @Headers('user-agent') ua: string | undefined, @Res({ passthrough: true }) res: Response) {
    const { initData } = parse(miniAppSchema, body);
    const tg = verifyMiniAppInitData(initData, this.botToken(), this.maxAge());
    if (!tg) throw new UnauthorizedException('Telegram imzosi noto‘g‘ri yoki eskirgan');
    return this.respond(res, await this.auth.loginWithTelegram(tg, ua));
  }

  /** Faqat lokal ishlab chiqish: Login Widget localhost'da ishlamaydi. */
  @Public()
  @Post('dev-login')
  @HttpCode(200)
  async devLogin(@Body() body: unknown, @Headers('user-agent') ua: string | undefined, @Res({ passthrough: true }) res: Response) {
    if (!this.config.get('DEV_LOGIN', { infer: true }) || this.config.get('NODE_ENV', { infer: true }) !== 'development') {
      throw new NotFoundException();
    }
    const { telegramId } = parse(devLoginSchema, body);
    return this.respond(res, await this.auth.devLogin(telegramId, ua));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: AppRequest, @Headers('user-agent') ua: string | undefined, @Res({ passthrough: true }) res: Response) {
    try {
      return this.respond(res, await this.auth.refresh(this.cookie(req), ua));
    } catch (error) {
      res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(this.cookie(req));
    res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  /** Yo'riqnoma (walkthrough) ko'rildi yoki o'tkazib yuborildi: boshqa qurilmada ham qayta chiqmaydi. */
  @Post('me/onboarding')
  @HttpCode(204)
  async onboardingSeen(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    await this.auth.markOnboarding(user.id, parse(onboardingSchema, body).tour);
  }

  @Public()
  @Get('config')
  publicConfig() {
    return {
      botUsername: this.config.get('TELEGRAM_BOT_USERNAME', { infer: true }) ?? null,
      devLogin: this.config.get('DEV_LOGIN', { infer: true }) && this.config.get('NODE_ENV', { infer: true }) === 'development',
    };
  }

  private respond(res: Response, tokens: IssuedTokens) {
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
      path: COOKIE_PATH,
      expires: tokens.refreshExpiresAt,
    });
    return { accessToken: tokens.accessToken };
  }

  private cookie(req: AppRequest): string | undefined {
    const value: unknown = req.cookies?.[REFRESH_COOKIE];
    return typeof value === 'string' ? value : undefined;
  }

  private botToken(): string {
    const token = this.config.get('TELEGRAM_BOT_TOKEN', { infer: true });
    if (!token) throw new UnauthorizedException('Telegram bot sozlanmagan (TELEGRAM_BOT_TOKEN)');
    return token;
  }

  private maxAge(): number {
    return this.config.get('TELEGRAM_AUTH_MAX_AGE_SEC', { infer: true });
  }
}
