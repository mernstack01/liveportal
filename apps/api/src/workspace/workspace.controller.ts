import { Controller, Get } from '@nestjs/common';
import type { WorkspaceContext } from '../auth/auth.types.js';
import { CurrentWorkspace, RequireMembership } from '../auth/decorators.js';
import { PrismaService } from '../db/prisma.service.js';

@Controller('workspace')
export class WorkspaceController {
  constructor(private readonly prisma: PrismaService) {}

  /** Hamkasblar ro'yxati: loyihaga qo'shish va task berish uchun. Telegram ID qaytarilmaydi. */
  @Get('members')
  @RequireMembership()
  async members(@CurrentWorkspace() workspace: WorkspaceContext) {
    const rows = await this.prisma.workspaceMember.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { joinedAt: 'asc' },
      select: {
        userId: true,
        joinedAt: true,
        role: { select: { name: true } },
        user: { select: { name: true, telegramUsername: true, avatarUrl: true } },
      },
    });
    return rows.map((m) => ({
      userId: m.userId,
      name: m.user.name,
      telegramUsername: m.user.telegramUsername,
      avatarUrl: m.user.avatarUrl,
      role: m.role.name,
      joinedAt: m.joinedAt,
    }));
  }
}
