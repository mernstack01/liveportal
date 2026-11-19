import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isPrimaryRole } from '@liveportal/shared';
import type { TelegramUser } from '../auth/telegram-verify.js';
import { sha256 } from '../common/crypto.js';
import type { Env } from '../config/env.js';
import { PrismaService } from '../db/prisma.service.js';
import { createInviteRecord, inviteLink } from './invite-record.js';

export type InviteErrorCode = 'not_found' | 'used' | 'expired';

export class InviteError extends Error {
  constructor(readonly code: InviteErrorCode) {
    super(`Invite ${code}`);
  }
}

export interface AcceptedInvite {
  userId: string;
  userName: string;
  workspaceName: string;
  role: string;
}

@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Taklif yaratish. Qoida: odam faqat o'zida bor ruxsatlar to'plamidan
   * oshmaydigan rolga taklif qila oladi (admin owner yarata olmaydi).
   */
  async create(args: { workspaceId: string; roleName: string; note?: string; createdById: string; inviterPermissions: string[] }) {
    const role = await this.prisma.role.findUnique({
      where: { workspaceId_name: { workspaceId: args.workspaceId, name: args.roleName } },
    });
    if (!role || role.scope !== 'WORKSPACE') throw new ForbiddenException('Bunday workspace roli yo‘q');
    // Qo'shimcha rol (masalan "Savdo") taklif bilan emas, qo'shilgandan keyin Jamoa sahifasida beriladi.
    if (!isPrimaryRole(role.name)) throw new ForbiddenException('Taklif faqat asosiy rolga (A’zo, Admin, Mijoz, Rahbar) qilinadi');
    const escalates = role.permissions.some((p) => !args.inviterPermissions.includes(p));
    if (escalates) throw new ForbiddenException('O‘zingizdan yuqori rolga taklif qila olmaysiz');

    const invite = await createInviteRecord(this.prisma, args);
    return {
      id: invite.id,
      role: invite.role,
      expiresAt: invite.expiresAt,
      link: inviteLink(this.config.get('TELEGRAM_BOT_USERNAME', { infer: true }), invite.token),
      token: invite.token,
    };
  }

  /** Hali ishlatilmagan va muddati o'tmagan takliflar. Havolaning o'zi qayta ko'rsatilmaydi (faqat xeshi saqlanadi). */
  async pending(workspaceId: string) {
    const rows = await this.prisma.invite.findMany({
      where: { workspaceId, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      include: { role: { select: { name: true } }, createdBy: { select: { name: true } } },
    });
    return rows.map((i) => ({ id: i.id, role: i.role.name, note: i.note, createdBy: i.createdBy?.name ?? null, createdAt: i.createdAt, expiresAt: i.expiresAt }));
  }

  /** Bekor qilish: havola darhol ishlamay qoladi (yozuv tarix uchun qoladi). */
  async revoke(workspaceId: string, inviteId: string): Promise<void> {
    const revoked = await this.prisma.invite.updateMany({
      where: { id: inviteId, workspaceId, usedAt: null, expiresAt: { gt: new Date() } },
      data: { expiresAt: new Date() },
    });
    if (revoked.count === 0) throw new NotFoundException('Faol taklif topilmadi (ishlatilgan yoki muddati o‘tgan)');
  }

  /** Bot `/start inv_<token>` da chaqiradi. Bir martalik, muddati cheklangan. */
  async accept(token: string, tg: TelegramUser): Promise<AcceptedInvite> {
    return this.prisma.$transaction(async (tx) => {
      const invite = await tx.invite.findUnique({
        where: { tokenHash: sha256(token) },
        include: { role: true, workspace: true },
      });
      if (!invite) throw new InviteError('not_found');
      if (invite.usedAt) throw new InviteError('used');
      if (invite.expiresAt <= new Date()) throw new InviteError('expired');

      const name = [tg.first_name, tg.last_name].filter(Boolean).join(' ');
      const user = await tx.user.upsert({
        where: { telegramId: BigInt(tg.id) },
        update: { name, telegramUsername: tg.username ?? null },
        create: { name, telegramId: BigInt(tg.id), telegramUsername: tg.username ?? null },
      });

      // Bir vaqtda ikki marta ishlatilishining oldini olish.
      const marked = await tx.invite.updateMany({
        where: { id: invite.id, usedAt: null },
        data: { usedAt: new Date(), usedById: user.id },
      });
      if (marked.count === 0) throw new InviteError('used');

      await tx.workspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: user.id } },
        update: { roleId: invite.roleId },
        create: { workspaceId: invite.workspaceId, userId: user.id, roleId: invite.roleId },
      });

      return { userId: user.id, userName: name, workspaceName: invite.workspace.name, role: invite.role.name };
    });
  }
}
