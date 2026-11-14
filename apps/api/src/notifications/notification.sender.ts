import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { PrismaService } from '../db/prisma.service.js';
import { localDay } from '../tasks/due.js';
import { openTasksFor } from '../tasks/open-tasks.js';
import { renderMessage, type MessageInput, type RenderedMessage } from './notification-message.js';
import type { NotificationKind } from './notification-rules.js';
import { renderDigest } from './task-list-message.js';
import { TelegramGateway, TelegramPermanentError, TelegramRetryAfterError } from './telegram.gateway.js';

const MAX_ATTEMPTS = 5;
const LEASE_MINUTES = 5;
const BATCH = 20;

/**
 * Notification navbatini (status=pending) Telegram'ga yuboradi.
 * Olingan qator LEASE_MINUTES ga band qilinadi: process yiqilsa, muddat o'tgach qayta olinadi.
 * Xato: 429 — Telegram aytgan vaqtda; 400/403 — qayta urinmaslik; boshqasi — 30s, 1m, 2m… (5 marta).
 */
@Injectable()
export class NotificationSender implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(NotificationSender.name);
  private timer?: NodeJS.Timeout;
  private running?: Promise<number>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramGateway,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onApplicationBootstrap(): void {
    const intervalMs = this.config.get('NOTIFY_POLL_MS', { infer: true });
    if (intervalMs <= 0) return;
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.timer);
    await this.running;
  }

  /** Hozir yuborilishi kerak bo'lganlarning hammasini yuboradi. Qaytaradi: nechtasi yuborildi. */
  async drain(): Promise<number> {
    let sent = 0;
    for (;;) {
      const claimed = await this.claim();
      if (claimed.length === 0) return sent;
      for (const row of claimed) if (await this.deliver(row.id, row.attempts)) sent += 1;
    }
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = this.drain();
    try {
      await this.running;
    } catch (error) {
      this.logger.error(`Bildirishnoma aylanishi xato berdi: ${String(error)}`);
    } finally {
      this.running = undefined;
    }
  }

  /**
   * Vaqt ilova soatidan olinadi: `nextAttemptAt` ni Prisma ham ilovada yozadi. Bazaning now() i bilan
   * solishtirilsa, Docker VM soati orqada qolganda yangi xabarlar keyingi aylanishga qolib ketardi.
   */
  private claim() {
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + LEASE_MINUTES * 60_000);
    return this.prisma.$queryRaw<{ id: string; attempts: number }[]>`
      UPDATE "Notification"
      SET "attempts" = "attempts" + 1, "nextAttemptAt" = ${leaseUntil}
      WHERE id IN (
        SELECT id FROM "Notification"
        WHERE status = 'pending' AND channel = 'telegram' AND "nextAttemptAt" <= ${now}
        ORDER BY "nextAttemptAt", id
        LIMIT ${BATCH}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, "attempts"`;
  }

  private async deliver(id: string, attempts: number): Promise<boolean> {
    const n = await this.prisma.notification.findUniqueOrThrow({
      where: { id },
      include: { user: { select: { telegramId: true } }, event: true },
    });
    if (!n.user.telegramId) {
      await this.finish(id, 'failed', 'Foydalanuvchi Telegram’ga ulanmagan');
      return false;
    }

    try {
      const message = await this.build(n.kind as NotificationKind, n.userId, n.event);
      if (message === 'empty') {
        // Xulosa bo'sh yoki task allaqachon yopilgan: yuboradigan narsa yo'q.
        await this.prisma.notification.update({ where: { id }, data: { status: 'skipped' } });
        return false;
      }
      if (!message) {
        await this.finish(id, 'failed', 'Task yoki loyiha topilmadi');
        return false;
      }
      await this.telegram.send(n.user.telegramId.toString(), message);
      await this.prisma.notification.update({ where: { id }, data: { status: 'sent', sentAt: new Date(), lastError: null } });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (error instanceof TelegramPermanentError || attempts >= MAX_ATTEMPTS) {
        await this.finish(id, 'failed', message);
      } else {
        const seconds = error instanceof TelegramRetryAfterError ? error.seconds : 30 * 2 ** (attempts - 1);
        await this.prisma.notification.update({
          where: { id },
          data: { nextAttemptAt: new Date(Date.now() + seconds * 1000), lastError: message.slice(0, 500) },
        });
      }
      this.logger.warn(`Bildirishnoma ${id} (${attempts}-urinish) yuborilmadi: ${message}`);
      return false;
    }
  }

  private finish(id: string, status: 'failed', lastError: string) {
    return this.prisma.notification.update({ where: { id }, data: { status, lastError: lastError.slice(0, 500) } });
  }

  /** Matn yuborish paytidagi ma'lumotdan quriladi: task nomi o'zgargan bo'lsa, yangisi ko'rinadi. */
  private async build(
    kind: NotificationKind,
    recipientId: string,
    event: { actorId: string | null; entityType: string; entityId: string; payload: unknown },
  ): Promise<RenderedMessage | 'empty' | null> {
    if (kind === 'digest') {
      const tasks = await openTasksFor(this.prisma, recipientId);
      const webOrigin = this.config.get('WEB_ORIGIN', { infer: true });
      return renderDigest(tasks, localDay(new Date()), webOrigin, true) ?? 'empty';
    }
    const input = await this.buildInput(kind, recipientId, event);
    if (!input) return null;
    // Navbatda turgan paytda task yopilgan bo'lsa, "muddati o'tdi" endi kerak emas.
    if (kind === 'overdue' && input.task && ['DONE', 'CANCELED'].includes(input.task.statusCategory)) return 'empty';
    return renderMessage(input);
  }

  private async buildInput(
    kind: NotificationKind,
    recipientId: string,
    event: { actorId: string | null; entityType: string; entityId: string; payload: unknown },
  ): Promise<MessageInput | null> {
    const webOrigin = this.config.get('WEB_ORIGIN', { infer: true });
    const actor = event.actorId ? await this.prisma.user.findUnique({ where: { id: event.actorId }, select: { name: true } }) : null;
    const payload = (event.payload ?? {}) as { commentId?: string; userId?: string; role?: string };

    if (event.entityType === 'project') {
      const project = await this.prisma.project.findUnique({ where: { id: event.entityId }, select: { id: true, name: true } });
      if (!project) return null;
      const role = payload.role
        ? await this.prisma.role.findFirst({ where: { name: payload.role, workspace: { projects: { some: { id: project.id } } } }, select: { title: true } })
        : null;
      return { kind, recipientId, actorName: actor?.name ?? null, webOrigin, project, role: role?.title ?? payload.role };
    }

    const task = await this.prisma.task.findUnique({
      where: { id: event.entityId },
      include: { project: { select: { key: true, name: true } }, status: true, assignee: { select: { name: true } } },
    });
    if (!task) return null;
    const comment = payload.commentId
      ? await this.prisma.comment.findUnique({ where: { id: payload.commentId }, select: { body: true } })
      : null;

    return {
      kind,
      recipientId,
      actorName: actor?.name ?? null,
      webOrigin,
      commentBody: comment?.body,
      task: {
        id: task.id,
        key: `${task.project.key}-${task.number}`,
        number: task.number,
        title: task.title,
        projectId: task.projectId,
        projectName: task.project.name,
        dueDate: task.dueDate,
        dueTime: task.dueTime,
        priority: task.priority,
        statusName: task.status.name,
        statusCategory: task.status.category,
        assigneeId: task.assigneeId,
        assigneeName: task.assignee?.name ?? null,
      },
    };
  }
}
