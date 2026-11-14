import { Injectable, Logger } from '@nestjs/common';
import { recordEvent } from '../events/outbox.js';
import { PrismaService } from '../db/prisma.service.js';
import { addDays, dayStart, localDay } from '../tasks/due.js';

const CLOSED = ['DONE', 'CANCELED'] as const;

export interface MorningResult {
  ran: boolean;
  period: string;
  overdue: number;
  digests: number;
}

/**
 * Ertalabki ish (kuniga bir marta, Toshkent sanasi bo'yicha):
 * 1) muddati o'tgan ochiq tasklar uchun `task.overdue` (har muddat uchun bir marta);
 * 2) muddati o'tgan / bugun / ertaga tugaydigan taski bor har bir odamga `user.digest`.
 * Hammasi va JobRun qatori bitta tranzaksiyada: xato bo'lsa hech narsa yozilmaydi, keyingi tekshiruvda qayta.
 */
@Injectable()
export class MorningJob {
  private readonly logger = new Logger(MorningJob.name);

  constructor(private readonly prisma: PrismaService) {}

  async run(now = new Date()): Promise<MorningResult> {
    const today = localDay(now);
    const tomorrow = addDays(today, 1);

    return this.prisma.$transaction(
      async (tx) => {
        const claimed = await tx.jobRun.createMany({ data: [{ job: 'morning', period: today }], skipDuplicates: true });
        if (claimed.count === 0) return { ran: false, period: today, overdue: 0, digests: 0 };

        // 1) Yangi kechikkanlar: shu muddat uchun hali overdue eventi yo'q.
        const lateIds = await tx.$queryRaw<{ id: string }[]>`
          SELECT t.id FROM "Task" t
          JOIN "WorkflowStatus" s ON s.id = t."statusId"
          JOIN "Project" p ON p.id = t."projectId"
          WHERE t."dueDate" < ${dayStart(today)}
            AND s.category NOT IN ('DONE', 'CANCELED')
            AND p.status <> 'ARCHIVED'
            AND NOT EXISTS (
              SELECT 1 FROM "Event" e
              WHERE e."entityId" = t.id AND e.type = 'task.overdue'
                AND e.payload->>'dueDate' = to_char(t."dueDate", 'YYYY-MM-DD')
            )`;
        const late = await tx.task.findMany({
          where: { id: { in: lateIds.map((r) => r.id) } },
          include: { project: { select: { key: true, workspaceId: true } } },
        });
        for (const t of late) {
          await recordEvent(tx, {
            workspaceId: t.project.workspaceId,
            type: 'task.overdue',
            actorId: null,
            entityType: 'task',
            entityId: t.id,
            payload: {
              projectId: t.projectId,
              key: `${t.project.key}-${t.number}`,
              title: t.title,
              assigneeId: t.assigneeId,
              reporterId: t.reporterId,
              dueDate: t.dueDate!.toISOString().slice(0, 10),
            },
          });
        }

        // 2) Xulosa: ertagacha muddati bor ochiq tasklari bo'lgan, Telegram'ga ulangan odamlar.
        const due = await tx.task.findMany({
          where: {
            assignee: { telegramId: { not: null } },
            dueDate: { lte: dayStart(tomorrow) },
            status: { category: { notIn: [...CLOSED] } },
            project: { status: { not: 'ARCHIVED' } },
          },
          select: { assigneeId: true, project: { select: { workspaceId: true } } },
        });
        const recipients = new Map(due.map((t) => [`${t.project.workspaceId}:${t.assigneeId}`, t]));
        for (const t of recipients.values()) {
          await recordEvent(tx, {
            workspaceId: t.project.workspaceId,
            type: 'user.digest',
            actorId: null,
            entityType: 'user',
            entityId: t.assigneeId!,
            payload: { date: today },
          });
        }

        const result = { ran: true, period: today, overdue: late.length, digests: recipients.size };
        await tx.jobRun.update({ where: { job_period: { job: 'morning', period: today } }, data: { stats: result } });
        this.logger.log(`Ertalabki ish ${today}: ${late.length} ta kechikkan task, ${recipients.size} ta xulosa`);
        return result;
      },
      { timeout: 60_000 },
    );
  }
}
