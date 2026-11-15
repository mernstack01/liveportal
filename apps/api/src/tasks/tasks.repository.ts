import { Injectable } from '@nestjs/common';
import { PrismaService } from '../db/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';

type Db = PrismaService | Prisma.TransactionClient;

const person = { select: { id: true, name: true, telegramUsername: true, avatarUrl: true } } as const;

export const taskInclude = {
  status: { select: { id: true, name: true, category: true, color: true } },
  assignees: { orderBy: { createdAt: 'asc' }, select: { userId: true, user: person } },
  reporter: person,
  project: { select: { id: true, key: true, name: true } },
  incident: { select: { id: true, number: true, title: true, status: true, severity: true } },
  parent: { select: { id: true, number: true, title: true } },
  // Kartochkadagi "2/5" uchun: faqat holat toifasi.
  subtasks: { select: { status: { select: { category: true } } } },
} satisfies Prisma.TaskInclude;

export type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

const commentInclude = { author: person } satisfies Prisma.CommentInclude;
export type CommentRow = Prisma.CommentGetPayload<{ include: typeof commentInclude }>;

/** Task moduli jadvallariga (Task, Comment) murojaat faqat shu yerda. */
@Injectable()
export class TasksRepository {
  constructor(readonly prisma: PrismaService) {}

  projectState(projectId: string) {
    return this.prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { status: true } });
  }

  /** `ref` — task id yoki loyiha ichidagi raqam (LP-12 dagi 12). */
  findInProject(projectId: string, ref: string) {
    const where = /^\d{1,9}$/.test(ref) ? { projectId, number: Number(ref) } : { projectId, id: ref };
    return this.prisma.task.findFirst({ where, include: taskInclude });
  }

  subtasks(taskId: string) {
    return this.prisma.task.findMany({ where: { parentId: taskId }, orderBy: { number: 'asc' }, include: taskInclude });
  }

  /** Task tarixi: o'zining eventlari va unga qo'shilgan kichik vazifalar. */
  history(taskId: string) {
    return this.prisma.event.findMany({
      where: {
        OR: [
          { entityType: 'task', entityId: taskId, type: { in: ['task.created', 'task.updated', 'task.assigned', 'task.status_changed', 'task.commented', 'task.overdue'] } },
          { type: 'task.created', payload: { path: ['parentId'], equals: taskId } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: 300,
    });
  }

  comments(taskId: string) {
    return this.prisma.comment.findMany({ where: { taskId }, orderBy: { createdAt: 'asc' }, include: commentInclude });
  }

  /** Board: odatda faqat asosiy tasklar; kichik vazifalar ota task ichida ko'rinadi. */
  list(projectId: string, filter: { assigneeId?: string; statusId?: string; includeSubtasks?: boolean }) {
    return this.prisma.task.findMany({
      where: {
        projectId,
        ...(filter.includeSubtasks ? {} : { parentId: null }),
        ...(filter.statusId ? { statusId: filter.statusId } : {}),
        ...(filter.assigneeId ? { assignees: { some: { userId: filter.assigneeId } } } : {}),
      },
      orderBy: { number: 'desc' },
      take: 500,
      include: taskInclude,
    });
  }

  /** Mening ochiq tasklarim: arxivlanmagan loyihalarda, (all=false bo'lsa) yopilmaganlari. */
  mine(workspaceId: string, userId: string, includeClosed: boolean) {
    return this.prisma.task.findMany({
      where: {
        assignees: { some: { userId } },
        project: { workspaceId, status: { not: 'ARCHIVED' } },
        ...(includeClosed ? {} : { status: { category: { notIn: ['DONE', 'CANCELED'] } } }),
      },
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      take: 500,
      include: taskInclude,
    });
  }

  findStatus(projectId: string, statusId?: string) {
    return statusId
      ? this.prisma.workflowStatus.findFirst({ where: { id: statusId, projectId } })
      : this.prisma.workflowStatus.findFirst({ where: { projectId }, orderBy: { order: 'asc' } });
  }

  /** Hammasi loyiha a'zosimi (mas'ullar faqat a'zolardan). */
  async allProjectMembers(projectId: string, userIds: string[]) {
    if (userIds.length === 0) return true;
    // Mijozga (task.view yo'q) task berilmaydi: u boardni ko'rmaydi.
    const count = await this.prisma.projectMember.count({
      where: { projectId, userId: { in: userIds }, role: { permissions: { has: 'task.view' } } },
    });
    return count === new Set(userIds).size;
  }

  /** Mas'ullar ro'yxatini to'liq almashtiradi. */
  async setAssignees(db: Db, taskId: string, userIds: string[]) {
    await db.taskAssignee.deleteMany({ where: { taskId, userId: { notIn: userIds } } });
    await db.taskAssignee.createMany({ data: userIds.map((userId) => ({ taskId, userId })), skipDuplicates: true });
  }

  isProjectMember(projectId: string, userId: string) {
    return this.prisma.projectMember
      .findUnique({ where: { projectId_userId: { projectId, userId } }, select: { userId: true } })
      .then(Boolean);
  }

  /** Loyiha a'zolari username bo'yicha (mention uchun). */
  membersWithUsernames(projectId: string) {
    return this.prisma.projectMember.findMany({
      where: { projectId, user: { telegramUsername: { not: null } } },
      select: { userId: true, user: { select: { telegramUsername: true } } },
    });
  }

  /** Loyiha hisoblagichini oshirib, keyingi raqamni oladi (tranzaksiya ichida, poyga holatisiz). */
  async nextNumber(db: Db, projectId: string) {
    const { taskCounter } = await db.project.update({
      where: { id: projectId },
      data: { taskCounter: { increment: 1 } },
      select: { taskCounter: true },
    });
    return taskCounter;
  }

  create(db: Db, data: Prisma.TaskUncheckedCreateInput) {
    return db.task.create({ data, include: taskInclude });
  }

  update(db: Db, taskId: string, data: Prisma.TaskUncheckedUpdateInput) {
    return db.task.update({ where: { id: taskId }, data, include: taskInclude });
  }

  reload(db: Db, taskId: string) {
    return db.task.findUniqueOrThrow({ where: { id: taskId }, include: taskInclude });
  }

  createComment(db: Db, data: Prisma.CommentUncheckedCreateInput) {
    return db.comment.create({ data, include: commentInclude });
  }
}
