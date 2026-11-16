import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { newToken, sha256 } from '../common/crypto.js';
import type { Env } from '../config/env.js';
import { PrismaService } from '../db/prisma.service.js';
import type { AccessTokenPayload } from './auth.types.js';
import type { TelegramUser } from './telegram-verify.js';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export const NOT_INVITED_MESSAGE =
  'Siz hali tizimda yo‘qsiz. Teamlead yoki admin’dan taklif havolasini so‘rang va u orqali botga kiring.';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Telegram orqali tasdiqlangan odam. Faqat taklif orqali qo'shilganlar kira oladi. */
  async loginWithTelegram(tg: TelegramUser, userAgent?: string): Promise<IssuedTokens> {
    const user = await this.prisma.user.findUnique({
      where: { telegramId: BigInt(tg.id) },
      include: { workspaces: { take: 1 } },
    });
    if (!user || user.workspaces.length === 0) throw new ForbiddenException(NOT_INVITED_MESSAGE);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        name: [tg.first_name, tg.last_name].filter(Boolean).join(' '),
        telegramUsername: tg.username ?? null,
        avatarUrl: tg.photo_url ?? user.avatarUrl,
      },
    });
    return this.issueTokens(user.id, userAgent);
  }

  /** Faqat DEV_LOGIN=true va development'da (controller tekshiradi). */
  async devLogin(telegramId: number, userAgent?: string): Promise<IssuedTokens> {
    const user = await this.prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } });
    if (!user) throw new ForbiddenException(NOT_INVITED_MESSAGE);
    return this.issueTokens(user.id, userAgent);
  }

  /**
   * Refresh token rotatsiyasi: eski sessiya bekor qilinadi, yangisi beriladi.
   * Bekor qilingan token qayta ishlatilsa — o'g'irlangan deb hisoblanadi va
   * foydalanuvchining barcha sessiyalari yopiladi.
   */
  async refresh(refreshToken: string | undefined, userAgent?: string): Promise<IssuedTokens> {
    if (!refreshToken) throw new UnauthorizedException();
    const session = await this.prisma.session.findUnique({ where: { tokenHash: sha256(refreshToken) } });
    if (!session) throw new UnauthorizedException();

    if (session.revokedAt) {
      await this.prisma.session.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException();
    }
    if (session.expiresAt <= new Date()) throw new UnauthorizedException();

    const revoked = await this.prisma.session.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count === 0) throw new UnauthorizedException(); // parallel refresh
    return this.issueTokens(session.userId, userAgent);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    await this.prisma.session.updateMany({
      where: { tokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { workspaces: { include: { workspace: true, role: true }, orderBy: { joinedAt: 'asc' } } },
    });
    // Workspace'dan chiqarilgan odam: sessiyasi yopilgan, endi kira olmaydi.
    if (!user || user.workspaces.length === 0) throw new UnauthorizedException();
    return {
      id: user.id,
      name: user.name,
      telegramUsername: user.telegramUsername,
      avatarUrl: user.avatarUrl,
      onboarding: user.onboarding,
      workspaces: user.workspaces.map((m) => ({
        id: m.workspace.id,
        name: m.workspace.name,
        slug: m.workspace.slug,
        role: m.role.name,
        permissions: m.role.permissions,
      })),
    };
  }

  /** Takrorlansa ham bitta yozuv; ro'yxat cheksiz o'smasin (yo'riqnomalar soni oz). */
  async markOnboarding(userId: string, tour: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "User" SET "onboarding" = array_append("onboarding", ${tour})
      WHERE id = ${userId} AND NOT (${tour} = ANY("onboarding")) AND cardinality("onboarding") < 50`;
  }

  private async issueTokens(userId: string, userAgent?: string): Promise<IssuedTokens> {
    const payload: AccessTokenPayload = { sub: userId };
    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: this.config.get('JWT_ACCESS_TTL_SEC', { infer: true }),
    });
    const refreshToken = newToken();
    const days = this.config.get('REFRESH_TTL_DAYS', { infer: true });
    const refreshExpiresAt = new Date(Date.now() + days * 86_400_000);
    await this.prisma.session.create({
      data: { userId, tokenHash: sha256(refreshToken), userAgent: userAgent?.slice(0, 300), expiresAt: refreshExpiresAt },
    });
    return { accessToken, refreshToken, refreshExpiresAt };
  }
}
