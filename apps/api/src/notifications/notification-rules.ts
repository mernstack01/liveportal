import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventBus } from '../events/event-bus.js';
import type { Event, Prisma } from '../generated/prisma/client.js';
import { dealSupervisors } from '../deals/deals.service.js';
import type { DealKind } from './deal-message.js';
import type { IncidentKind } from './incident-message.js';

/** Insident eventlari payload'i (IncidentsService). */
interface IncidentPayload {
  projectId: string;
  ownerId: string | null;
  reporterId: string;
  changes?: { status?: unknown; severity?: unknown; owner?: { from: string | null; to: string | null } };
}

export type NotificationKind = 'claimed' | 'assigned' | 'mentioned' | 'commented' | 'review' | 'added' | 'overdue' | 'digest' | 'chat_mention' | 'client_message' | IncidentKind | DealKind;

/** Kelishuv eventlari payload'i (DealsService, DealStepJob). */
interface DealPayload {
  number: number;
  ownerId: string | null;
  changes?: { owner?: { from: string | null; to: string | null }; stage?: unknown; due?: unknown };
}

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

    // Yangi insident: loyihada insidentlarni ko'radigan hammaga (kam bo'ladi va muhim).
    this.bus.subscribe('incident.created', 'notify:incident-opened', async (e, tx) => {
      const p = e.payload as unknown as IncidentPayload;
      // Mas'ul darhol tayinlangan bo'lsa, unga "mas'ul qildi" xabari (bitta odamga bitta xabar).
      if (p.ownerId) await this.enqueue(tx, e, 'incident_owner', [p.ownerId]);
      return this.enqueue(tx, e, 'incident_opened', await this.incidentAudience(tx, p.projectId));
    });

    // Holat yoki daraja o'zgardi — hammaga; yangi mas'ulga alohida xabar.
    this.bus.subscribe('incident.updated', 'notify:incident-updated', async (e, tx) => {
      const p = e.payload as unknown as IncidentPayload;
      const newOwner = p.changes?.owner?.to;
      if (newOwner) await this.enqueue(tx, e, 'incident_owner', [newOwner]);
      if (p.changes?.status || p.changes?.severity) {
        await this.enqueue(tx, e, 'incident_status', await this.incidentAudience(tx, p.projectId));
      }
    });

    // Qo'lda yozilgan yangilanish: mas'ul va xabar berganga.
    this.bus.subscribe('incident.noted', 'notify:incident-noted', (e, tx) => {
      const p = e.payload as unknown as IncidentPayload;
      return this.enqueue(tx, e, 'incident_note', [p.ownerId, p.reporterId]);
    });

    // Kelishuvlar: rahbar(lar) hammasini biladi; mas'ul — o'ziga tegishlisini.
    this.bus.subscribe('deal.created', 'notify:deal-created', async (e, tx) => {
      const p = e.payload as unknown as DealPayload;
      // Rahbar boshqa odamga biriktirib yaratsa: o'sha odamga "mas'ul qildi", qolgan rahbarlarga "yangi so'rov".
      if (p.ownerId && p.ownerId !== e.actorId) await this.enqueue(tx, e, 'deal_owner', [p.ownerId]);
      const supervisors = await dealSupervisors(tx, e.workspaceId);
      return this.enqueue(tx, e, 'deal_created', supervisors.filter((id) => id === e.actorId || id !== p.ownerId));
    });

    this.bus.subscribe('deal.updated', 'notify:deal-updated', async (e, tx) => {
      const p = e.payload as unknown as DealPayload;
      const supervisors = await dealSupervisors(tx, e.workspaceId);
      if (p.changes?.owner?.to) await this.enqueue(tx, e, 'deal_owner', [p.changes.owner.to]);
      if (p.changes?.stage) await this.enqueue(tx, e, 'deal_stage', [...supervisors, p.ownerId]);
      if (p.changes?.due) await this.enqueue(tx, e, 'deal_due', [...supervisors, p.ownerId]);
    });

    this.bus.subscribe('deal.step_due', 'notify:deal-step-due', (e, tx) => {
      const p = e.payload as unknown as DealPayload;
      return this.enqueue(tx, e, 'deal_step_due', [p.ownerId]);
    });

    this.bus.subscribe('deal.step_overdue', 'notify:deal-step-overdue', async (e, tx) =>
      this.enqueue(tx, e, 'deal_step_overdue', await dealSupervisors(tx, e.workspaceId)),
    );

    // To'lovlar: naqd — rahbarga tasdiq uchun, plastik — rahbarga ma'lumot; natija — kiritgan va mas'ulga.
    this.bus.subscribe('deal.payment_added', 'notify:payment-added', async (e, tx) => {
      const p = e.payload as unknown as { method: string };
      return this.enqueue(tx, e, p.method === 'CASH' ? 'payment_pending' : 'payment_received', await dealSupervisors(tx, e.workspaceId));
    });
    this.bus.subscribe('deal.payment_confirmed', 'notify:payment-confirmed', (e, tx) => {
      const p = e.payload as unknown as DealPayload & { createdById: string };
      return this.enqueue(tx, e, 'payment_confirmed', [p.createdById, p.ownerId]);
    });
    this.bus.subscribe('deal.payment_rejected', 'notify:payment-rejected', (e, tx) => {
      const p = e.payload as unknown as DealPayload & { createdById: string };
      return this.enqueue(tx, e, 'payment_rejected', [p.createdById, p.ownerId]);
    });
    this.bus.subscribe('deal.ready', 'notify:deal-ready', async (e, tx) => this.enqueue(tx, e, 'deal_ready', await dealSupervisors(tx, e.workspaceId)));

    this.bus.subscribe('user.digest', 'notify:digest', (e, tx) => this.enqueue(tx, e, 'digest', [e.entityId]));

    this.bus.subscribe('project.member_added', 'notify:added', (e, tx) => {
      const p = e.payload as unknown as { userId: string };
      return this.enqueue(tx, e, 'added', [p.userId]);
    });
  }

  private async incidentAudience(tx: Prisma.TransactionClient, projectId: string) {
    const members = await tx.projectMember.findMany({
      where: { projectId, role: { permissions: { has: 'incident.view' } } },
      select: { userId: true },
    });
    return members.map((m) => m.userId);
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
