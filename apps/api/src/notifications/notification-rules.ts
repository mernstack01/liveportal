import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventBus } from '../events/event-bus.js';
import type { Event, Prisma } from '../generated/prisma/client.js';

export type NotificationKind = 'claimed' | 'assigned' | 'mentioned' | 'commented' | 'review' | 'added' | 'overdue' | 'digest' | 'chat_mention' | 'client_message';

/** Task eventlari payload'i (TasksService.taskEvent). */
interface TaskPayload {
  projectId: string;
  assigneeIds: string[];
  added?: string[];
  claimed?: boolean;
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
      // "Men olaman": teamlead (muallif) biladi; oddiy tayinlash: qo'shilganlar xabar oladi.
      if (p.claimed) return this.enqueue(tx, e, 'claimed', [p.reporterId]);
      return this.enqueue(tx, e, 'assigned', p.added ?? []);
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
      return this.enqueue(tx, e, 'commented', [...(p.assigneeIds ?? []), p.reporterId].filter((id) => !id || !mentioned.has(id)));
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

    // Muddati o'tdi: bajaruvchi, muallif va teamleadlarga (soatli muddat — darhol, soatsiz — ertalab).
    this.bus.subscribe('task.overdue', 'notify:overdue', async (e, tx) => {
      const p = e.payload as unknown as TaskPayload;
      const closers = await tx.projectMember.findMany({
        where: { projectId: p.projectId, role: { permissions: { has: 'task.close' } } },
        select: { userId: true },
      });
      return this.enqueue(tx, e, 'overdue', [...(p.assigneeIds ?? []), p.reporterId, ...closers.map((c) => c.userId)]);
    });

    // Chatda @mention: belgilanganga (ular chatni ko'ra oladiganlar orasidan tanlangan).
    this.bus.subscribe('message.posted', 'notify:chat-mention', (e, tx) => {
      const p = e.payload as unknown as { mentions?: string[] };
      return this.enqueue(tx, e, 'chat_mention', p.mentions ?? []);
    });

    // "Mijoz bilan" chati: mijoz yozsa xodimlarga, xodim yozsa mijozlarga (ChatService hisoblaydi).
    this.bus.subscribe('message.posted', 'notify:client-chat', (e, tx) => {
      const p = e.payload as unknown as { notify?: string[] };
      return this.enqueue(tx, e, 'client_message', p.notify ?? []);
    });

    this.bus.subscribe('user.digest', 'notify:digest', (e, tx) => this.enqueue(tx, e, 'digest', [e.entityId]));

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
