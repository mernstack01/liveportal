import { ConflictException, Injectable } from '@nestjs/common';
import type { ProjectContext } from '../auth/auth.types.js';
import { PrismaService } from '../db/prisma.service.js';
import { recordEvent } from '../events/outbox.js';
import { extractMentions } from '../tasks/mentions.js';

const PAGE = 50;

/**
 * Loyihaning ichki chati: faqat `message.internal.read` ruxsati borlar (rahbar, admin, teamlead, dasturchi).
 * Mehmon (mijoz) ko'rmaydi. Kanal birinchi murojaatda yaratiladi.
 */
@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  private async channel(project: ProjectContext) {
    const existing = await this.prisma.channel.findFirst({ where: { projectId: project.id, type: 'INTERNAL' } });
    return existing ?? this.prisma.channel.create({ data: { workspaceId: project.workspaceId, projectId: project.id, type: 'INTERNAL', name: 'Jamoa' } });
  }

  /** Oxirgi xabarlar (eskisi tepada). `before` — shu xabardan oldingilar (yuqoriga yuklash). */
  async list(project: ProjectContext, before?: string) {
    const channel = await this.channel(project);
    const cursor = before ? await this.prisma.message.findFirst({ where: { id: before, channelId: channel.id }, select: { createdAt: true } }) : null;
    const rows = await this.prisma.message.findMany({
      where: { channelId: channel.id, ...(cursor ? { createdAt: { lt: cursor.createdAt } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: PAGE + 1,
      include: { author: { select: { id: true, name: true, avatarUrl: true, telegramUsername: true } } },
    });
    const page = rows.slice(0, PAGE).reverse();
    return {
      canWrite: project.permissions.includes('message.internal.write'),
      hasMore: rows.length > PAGE,
      messages: page.map((m) => ({
        id: m.id,
        body: m.body,
        createdAt: m.createdAt,
        author: m.author ? { userId: m.author.id, name: m.author.name, avatarUrl: m.author.avatarUrl, telegramUsername: m.author.telegramUsername } : null,
      })),
    };
  }

  async post(project: ProjectContext, authorId: string, body: string) {
    const state = await this.prisma.project.findUniqueOrThrow({ where: { id: project.id }, select: { status: true } });
    if (state.status === 'ARCHIVED') throw new ConflictException('Loyiha arxivda');
    const channel = await this.channel(project);

    // Faqat chatni ko'ra oladigan a'zolar mention qilinadi: mehmonga ichki xabar ketmasligi kerak.
    const names = new Set(extractMentions(body));
    const readers =
      names.size === 0
        ? []
        : await this.prisma.projectMember.findMany({
            where: {
              projectId: project.id,
              user: { telegramUsername: { not: null } },
              role: { permissions: { has: 'message.internal.read' } },
            },
            select: { userId: true, user: { select: { telegramUsername: true } } },
          });
    const mentions = readers.filter((m) => names.has(m.user.telegramUsername!.toLowerCase())).map((m) => m.userId).filter((id) => id !== authorId);

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: { channelId: channel.id, authorId, body, source: 'PORTAL' },
        include: { author: { select: { id: true, name: true, avatarUrl: true, telegramUsername: true } } },
      });
      await recordEvent(tx, {
        workspaceId: project.workspaceId,
        type: 'message.posted',
        actorId: authorId,
        entityType: 'message',
        entityId: created.id,
        payload: { projectId: project.id, channelId: channel.id, mentions },
      });
      return created;
    });
    return {
      id: message.id,
      body: message.body,
      createdAt: message.createdAt,
      author: { userId: message.author!.id, name: message.author!.name, avatarUrl: message.author!.avatarUrl, telegramUsername: message.author!.telegramUsername },
    };
  }
}
