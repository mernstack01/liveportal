import { Injectable } from '@nestjs/common';
import { PrismaService } from '../db/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';

type Db = PrismaService | Prisma.TransactionClient;

const person = { select: { id: true, name: true, telegramUsername: true, avatarUrl: true } } as const;

export const taskInclude = {
  status: { select: { id: true, name: true, category: true, color: true } },
  assignee: person,
  reporter: person,
  project: { select: { id: true, key: true, name: true } },
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

  comments(taskId: string) {
    return this.prisma.comment.findMany({ where: { taskId }, orderBy: { createdAt: 'asc' }, include: commentInclude });
  }

  list(projectId: string, filter: { assigneeId?: string; statusId?: string }) {
    return this.prisma.task.findMany({
      where: { projectId, ...filter },
      orderBy: { number: 'desc' },
      take: 500,
      include: taskInclude,
    });
  }

  /** Mening ochiq tasklarim: arxivlanmagan loyihalarda, (all=false bo'lsa) yopilmaganlari. */
  mine(workspaceId: string, userId: string, includeClosed: boolean) {
    return this.prisma.task.findMany({
      where: {
        assigneeId: userId,
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

  createComment(db: Db, data: Prisma.CommentUncheckedCreateInput) {
    return db.comment.create({ data, include: commentInclude });
  }
}
