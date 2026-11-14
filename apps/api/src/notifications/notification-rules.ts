import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventBus } from '../events/event-bus.js';
import type { Event, Prisma } from '../generated/prisma/client.js';

export type NotificationKind = 'assigned' | 'mentioned' | 'commented' | 'review' | 'added';

/** Task eventlari payload'i (TasksService.taskEvent). */
interface TaskPayload {
  projectId: string;
  assigneeId: string | null;
  reporterId: string;
  userId?: string;
  commentId?: string;
  to?: { category: string };
}

/**
 * Kimga Telegram xabari borishi (docs/07, 10-savol: faqat muhim eventlar darhol).
 * Qoidalar EventBus obunachisi; Notification qatorlari dispatcher tranzaksiyasida yoziladi.
 * Hech kimga o'zi qilgan ish haqida xabar bormaydi.
 */
@Injectable()
export class NotificationRules implements OnModuleInit {
  constructor(private readonly bus: EventBus) {}

  onModuleInit(): void {
    this.bus.subscribe('task.assigned', 'notify:assigned', (e, tx) => {
      const p = e.payload as unknown as TaskPayload;
      return this.enqueue(tx, e, 'assigned', [p.assigneeId]);
    });

    this.bus.subscribe('task.mentioned', 'notify:mentioned', (e, tx) => {
      const p = e.payload as unknown as TaskPayload;
      return this.enqueue(tx, e, 'mentioned', [p.userId]);
    });

    // Izoh bajaruvchi va muallifga; shu izohda mention qilinganlar "mentioned" xabarini oladi, ikkinchisini emas.
    this.bus.subscribe('task.commented', 'notify:commented', async (e, tx) => {
      const p = e.payload as unknown as TaskPayload;
      const comment = p.commentId ? await tx.comment.findUnique({ where: { id: p.commentId }, select: { mentions: true } }) : null;
      const mentioned = new Set(comment?.mentions ?? []);
      return this.enqueue(tx, e, 'commented', [p.assigneeId, p.reporterId].filter((id) => !id || !mentioned.has(id)));
    });

    // Review'ga o'tdi: muallif va loyihada taskni yopa oladiganlar (teamlead).
    this.bus.subscribe('task.status_changed', 'notify:review', async (e, tx) => {
      const p = e.payload as unknown as TaskPayload;
      if (p.to?.category !== 'REVIEW') return;
      const closers = await tx.projectMember.findMany({
        where: { projectId: p.projectId, role: { permissions: { has: 'task.close' } } },
        select: { userId: true },
      });
      return this.enqueue(tx, e, 'review', [p.reporterId, ...closers.map((c) => c.userId)]);
    });

    this.bus.subscribe('project.member_added', 'notify:added', (e, tx) => {
      const p = e.payload as unknown as { userId: string };
      return this.enqueue(tx, e, 'added', [p.userId]);
    });
  }

  private async enqueue(tx: Prisma.TransactionClient, event: Event, kind: NotificationKind, userIds: (string | null | undefined)[]) {
    const recipients = [...new Set(userIds.filter((id): id is string => !!id && id !== event.actorId))];
    if (recipients.length === 0) return;
    await tx.notification.createMany({
      data: recipients.map((userId) => ({ userId, eventId: event.id, channel: 'telegram', kind })),
      skipDuplicates: true,
    });
  }
}
