import { open, rm } from 'node:fs/promises';
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { ProjectContext } from '../auth/auth.types.js';
import { parse } from '../common/zod.js';
import { PrismaService } from '../db/prisma.service.js';
import { recordEvent } from '../events/outbox.js';
import { sniffImage } from '../files/file-sniff.js';
import { FileLinksService } from '../files/file-links.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { extractMentions } from '../tasks/mentions.js';

const author = { select: { id: true, name: true, avatarUrl: true, telegramUsername: true } } as const;
const messageInclude = { author, attachments: { orderBy: { createdAt: 'asc' } } } satisfies Prisma.MessageInclude;
type MessageRow = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

/** Birinchi baytlar: rasmmi yoki oddiy fayl. */
async function head(path: string): Promise<Buffer> {
  const fd = await open(path, 'r');
  try {
    const { buffer, bytesRead } = await fd.read(Buffer.alloc(16), 0, 16, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await fd.close();
  }
}

const PAGE = 50;

/**
 * Loyihaning ichki chati: faqat `message.internal.read` ruxsati borlar (rahbar, admin, teamlead, dasturchi).
 * Mehmon (mijoz) ko'rmaydi. Kanal birinchi murojaatda yaratiladi.
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly links: FileLinksService,
  ) {}

  private toMessage(m: MessageRow) {
    return {
      id: m.id,
      body: m.body,
      createdAt: m.createdAt,
      author: m.author ? { userId: m.author.id, name: m.author.name, avatarUrl: m.author.avatarUrl, telegramUsername: m.author.telegramUsername } : null,
      attachments: m.attachments.map((a) => ({
        id: a.id,
        fileName: a.fileName,
        kind: a.kind,
        mimeType: a.mimeType,
        size: a.size,
        url: this.links.url(a.id),
      })),
    };
  }

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
      include: messageInclude,
    });
    const page = rows.slice(0, PAGE).reverse();
    return {
      canWrite: project.permissions.includes('message.internal.write'),
      hasMore: rows.length > PAGE,
      messages: page.map((m) => this.toMessage(m)),
    };
  }

  /** Matn va/yoki fayllar. Xato bo'lsa, diskka tushgan fayllar o'chiriladi. */
  async post(project: ProjectContext, authorId: string, input: unknown, files: Express.Multer.File[]) {
    try {
      const { body } = parse(z.object({ body: z.string().trim().max(4000).default('') }), input ?? {});
      if (!body && files.length === 0) throw new BadRequestException('Xabar yoki fayl kerak');
      const state = await this.prisma.project.findUniqueOrThrow({ where: { id: project.id }, select: { status: true } });
      if (state.status === 'ARCHIVED') throw new ConflictException('Loyiha arxivda');
      const channel = await this.channel(project);

      const attachments = await Promise.all(
        files.map(async (f) => {
          const image = sniffImage(await head(f.path));
          return {
            workspaceId: project.workspaceId,
            projectId: project.id,
            uploaderId: authorId,
            fileName: f.originalname.slice(0, 200) || 'fayl',
            mimeType: image ?? (f.mimetype || 'application/octet-stream').slice(0, 100),
            kind: image ? 'image' : 'file',
            size: f.size,
            storageKey: f.filename,
          };
        }),
      );

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
          data: { channelId: channel.id, authorId, body, source: 'PORTAL', attachments: { create: attachments } },
          include: messageInclude,
        });
        await recordEvent(tx, {
          workspaceId: project.workspaceId,
          type: 'message.posted',
          actorId: authorId,
          entityType: 'message',
          entityId: created.id,
          payload: { projectId: project.id, channelId: channel.id, mentions, attachments: attachments.length },
        });
        return created;
      });
      return this.toMessage(message);
    } catch (error) {
      await Promise.all(files.map((f) => rm(f.path, { force: true })));
      throw error;
    }
  }
}
