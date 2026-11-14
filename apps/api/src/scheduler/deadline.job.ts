import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../db/prisma.service.js';
import { recordEvent } from '../events/outbox.js';

/**
 * Soatli muddatlar (Bitrix24 kabi): muddat daqiqasi o'tishi bilan `task.overdue`.
 * Har daqiqada ishlaydi; har muddat uchun bir marta (payload.deadline). Bir nechta API nusxasi
 * bo'lsa, advisory lock bittasini o'tkazadi. Soatsiz muddatlarni ertalabki ish (MorningJob) beradi.
 */
@Injectable()
export class DeadlineJob {
  private readonly logger = new Logger(DeadlineJob.name);

  constructor(private readonly prisma: PrismaService) {}

  async run(now = new Date()): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('liveportal:deadline-job'))`;
      const due = await tx.$queryRaw<{ id: string; deadline: string }[]>`
        SELECT t.id, to_char(t."dueDate", 'YYYY-MM-DD') || ' ' || t."dueTime" AS deadline
        FROM "Task" t
        JOIN "WorkflowStatus" s ON s.id = t."statusId"
        JOIN "Project" p ON p.id = t."projectId"
        WHERE t."dueTime" IS NOT NULL AND t."dueDate" IS NOT NULL
          AND ((t."dueDate"::date + t."dueTime"::time) AT TIME ZONE 'Asia/Tashkent') <= ${now}
          AND s.category NOT IN ('DONE', 'CANCELED')
          AND p.status <> 'ARCHIVED'
          AND NOT EXISTS (
            SELECT 1 FROM "Event" e
            WHERE e."entityId" = t.id AND e.type = 'task.overdue'
              AND e.payload->>'deadline' = to_char(t."dueDate", 'YYYY-MM-DD') || ' ' || t."dueTime"
          )`;
      if (due.length === 0) return 0;
      const deadlines = new Map(due.map((d) => [d.id, d.deadline]));
      const tasks = await tx.task.findMany({
        where: { id: { in: [...deadlines.keys()] } },
        include: { project: { select: { key: true, workspaceId: true } }, assignees: { select: { userId: true } } },
      });
      for (const t of tasks) {
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
            assigneeIds: t.assignees.map((a) => a.userId),
            reporterId: t.reporterId,
            dueDate: t.dueDate!.toISOString().slice(0, 10),
            dueTime: t.dueTime,
            deadline: deadlines.get(t.id)!,
          },
        });
      }
      this.logger.log(`Muddati o‘tgan (soatli): ${tasks.length} ta task`);
      return tasks.length;
    });
  }
}
