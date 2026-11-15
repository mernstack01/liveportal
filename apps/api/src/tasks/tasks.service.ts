import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Permission } from '@liveportal/shared';
import type { ProjectContext, WorkspaceContext } from '../auth/auth.types.js';
import { type DomainEvent, recordEvent } from '../events/outbox.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { CreateTaskDto, UpdateTaskDto } from './dto/task.dto.js';
import { extractMentions } from './mentions.js';
import { type CommentRow, type TaskRow, TasksRepository } from './tasks.repository.js';

type Person = TaskRow['reporter'] | null;

/** Yopilgan holatlar: bu yerga o'tkazish yoki bu yerdan qaytarish `task.close` talab qiladi (docs/07, 4-savol). */
const CLOSED = new Set(['DONE', 'CANCELED']);

function toPerson(u: Person) {
  return u ? { userId: u.id, name: u.name, telegramUsername: u.telegramUsername, avatarUrl: u.avatarUrl } : null;
}

export function toTask(t: TaskRow) {
  return {
    id: t.id,
    key: `${t.project.key}-${t.number}`,
    number: t.number,
    project: t.project,
    title: t.title,
    description: t.description,
    priority: t.priority,
    dueDate: t.dueDate,
    dueTime: t.dueTime,
    completedAt: t.completedAt,
    status: t.status,
    assignees: t.assignees.map((a) => toPerson(a.user)!),
    reporter: toPerson(t.reporter),
    /** Insidentdan yaratilgan bo'lsa — qaysi insident. */
    incident: t.incident ? { ...t.incident, key: `INC-${t.incident.number}` } : null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

function toComment(c: CommentRow) {
  return { id: c.id, author: toPerson(c.author), body: c.body, mentions: c.mentions, createdAt: c.createdAt };
}

/** Bildirishnoma eventsiz bazaga qayta murojaat qilmasligi uchun payload'da asosiy maydonlar bor. */
function taskEvent(project: ProjectContext, t: TaskRow, actorId: string, type: DomainEvent['type'], extra: Prisma.InputJsonObject = {}): DomainEvent {
  return {
    workspaceId: project.workspaceId,
    type,
    actorId,
    entityType: 'task',
    entityId: t.id,
    payload: {
      projectId: project.id,
      key: `${t.project.key}-${t.number}`,
      title: t.title,
      assigneeIds: t.assignees.map((a) => a.userId),
      reporterId: t.reporterId,
      ...extra,
    },
  };
}

@Injectable()
export class TasksService {
  constructor(private readonly repo: TasksRepository) {}

  async list(project: ProjectContext, userId: string, filter: { assignee?: string; statusId?: string }) {
    const assigneeId = filter.assignee === 'me' ? userId : filter.assignee;
    const rows = await this.repo.list(project.id, { assigneeId, statusId: filter.statusId });
    return rows.map(toTask);
  }

  async mine(workspace: WorkspaceContext, userId: string, includeClosed: boolean) {
    return (await this.repo.mine(workspace.id, userId, includeClosed)).map(toTask);
  }

  async get(project: ProjectContext, ref: string) {
    const task = await this.requireTask(project, ref);
    const comments = await this.repo.comments(task.id);
    return { ...toTask(task), comments: comments.map(toComment) };
  }

  async create(project: ProjectContext, actorId: string, dto: CreateTaskDto) {
    await this.assertWritable(project);
    const { statusId, assigneeIds: rawAssignees, ...fields } = dto;
    const assigneeIds = [...new Set(rawAssignees ?? [])];
    if (assigneeIds.length > 0) this.require(project, ['task.assign']);

    const status = await this.repo.findStatus(project.id, statusId);
    if (!status) throw new BadRequestException('Bunday status bu loyihada yo‘q');
    const closing = CLOSED.has(status.category);
    if (closing) this.require(project, ['task.close']);
    await this.assertMembers(project, assigneeIds);
    if (fields.incidentId) {
      // Insidentdan task: insident shu loyihada bo'lishi va odam uni ko'ra olishi kerak.
      this.require(project, ['incident.view']);
      const incident = await this.repo.prisma.incident.findFirst({ where: { id: fields.incidentId, projectId: project.id }, select: { id: true } });
      if (!incident) throw new BadRequestException('Bunday insident bu loyihada yo‘q');
    }

    const task = await this.repo.prisma.$transaction(async (tx) => {
      const number = await this.repo.nextNumber(tx, project.id);
      const created = await this.repo.create(tx, {
        ...fields,
        projectId: project.id,
        number,
        statusId: status.id,
        reporterId: actorId,
        completedAt: closing ? new Date() : null,
        assignees: { create: assigneeIds.map((userId) => ({ userId })) },
      });
      await recordEvent(tx, taskEvent(project, created, actorId, 'task.created', { status: status.name }));
      if (created.incidentId) {
        // Insident xronologiyasida ko'rinadi: "task yaratdi: ITL-12 · ...".
        await tx.incidentUpdate.create({
          data: { incidentId: created.incidentId, authorId: actorId, kind: 'task', body: created.title, to: `${created.project.key}-${created.number}` },
        });
      }
      if (assigneeIds.length > 0) {
        await recordEvent(tx, taskEvent(project, created, actorId, 'task.assigned', { added: assigneeIds, removed: [] }));
      }
      return created;
    });
    return { ...toTask(task), comments: [] };
  }

  async update(project: ProjectContext, actorId: string, ref: string, dto: UpdateTaskDto) {
    await this.assertWritable(project);
    const task = await this.requireTask(project, ref);
    const { assigneeIds: rawAssignees, statusId, ...fields } = dto;
    const current = task.assignees.map((a) => a.userId);
    const next = rawAssignees ? [...new Set(rawAssignees)] : current;
    const added = next.filter((id) => !current.includes(id));
    const removed = current.filter((id) => !next.includes(id));
    const assigneeChanged = added.length > 0 || removed.length > 0;

    const needed: Permission[] = [];
    if (Object.keys(fields).length > 0) needed.push('task.update');
    if (assigneeChanged) needed.push('task.assign');

    const newStatus = statusId !== undefined && statusId !== task.statusId ? await this.repo.findStatus(project.id, statusId) : undefined;
    if (newStatus === null) throw new BadRequestException('Bunday status bu loyihada yo‘q');
    const wasClosed = CLOSED.has(task.status.category);
    const nowClosed = newStatus ? CLOSED.has(newStatus.category) : wasClosed;
    if (newStatus) needed.push('task.update');
    if (newStatus && (wasClosed || nowClosed)) needed.push('task.close');
    this.require(project, needed);
    await this.assertMembers(project, added);

    // Sana olib tashlansa, soat ham ketadi; soat faqat sana bilan.
    if (fields.dueDate === null && task.dueTime) fields.dueTime = null;
    const nextDate = fields.dueDate !== undefined ? fields.dueDate : task.dueDate;
    if (fields.dueTime && !nextDate) throw new BadRequestException('Soat faqat sana bilan birga beriladi');

    const data: Prisma.TaskUncheckedUpdateInput = { ...fields };
    if (newStatus) {
      data.statusId = newStatus.id;
      if (wasClosed !== nowClosed) data.completedAt = nowClosed ? new Date() : null;
    }

    const updated = await this.repo.prisma.$transaction(async (tx) => {
      if (assigneeChanged) await this.repo.setAssignees(tx, task.id, next);
      const saved = await this.repo.update(tx, task.id, data);
      if (Object.keys(fields).length > 0) {
        await recordEvent(tx, taskEvent(project, saved, actorId, 'task.updated', { fields: Object.keys(fields) }));
      }
      if (assigneeChanged) {
        await recordEvent(tx, taskEvent(project, saved, actorId, 'task.assigned', { added, removed }));
      }
      if (newStatus) {
        const from = { id: task.status.id, name: task.status.name, category: task.status.category };
        const to = { id: newStatus.id, name: newStatus.name, category: newStatus.category };
        await recordEvent(tx, taskEvent(project, saved, actorId, 'task.status_changed', { from, to }));
      }
      return saved;
    });
    return this.get(project, updated.id);
  }

  /**
   * "Men olaman": dasturchi taskni o'ziga oladi (hech kim olmagan bo'lsa) yoki boshqalarga qo'shiladi.
   * O'zini qo'shish task.update bilan; boshqalarni tayinlash — task.assign (update orqali).
   */
  async claim(project: ProjectContext, actorId: string, ref: string, join: boolean) {
    await this.assertWritable(project);
    this.require(project, ['task.update']);
    if (join && !project.role) throw new BadRequestException('Taskni olish uchun loyiha a’zosi bo‘lishingiz kerak');
    const task = await this.requireTask(project, ref);
    const current = task.assignees.map((a) => a.userId);
    if (join === current.includes(actorId)) return this.get(project, task.id);

    await this.repo.prisma.$transaction(async (tx) => {
      if (join) await tx.taskAssignee.create({ data: { taskId: task.id, userId: actorId } });
      else await tx.taskAssignee.delete({ where: { taskId_userId: { taskId: task.id, userId: actorId } } });
      const saved = await this.repo.reload(tx, task.id);
      await recordEvent(
        tx,
        taskEvent(project, saved, actorId, 'task.assigned', join ? { added: [actorId], removed: [], claimed: true } : { added: [], removed: [actorId], left: true }),
      );
    });
    return this.get(project, task.id);
  }

  async comment(project: ProjectContext, actorId: string, ref: string, body: string) {
    await this.assertWritable(project);
    const task = await this.requireTask(project, ref);

    // Faqat loyiha a'zolari mention qilinadi: begona odamga loyiha haqida xabar ketmasligi kerak.
    const names = new Set(extractMentions(body));
    const members = names.size > 0 ? await this.repo.membersWithUsernames(project.id) : [];
    const mentioned = members.filter((m) => names.has(m.user.telegramUsername!.toLowerCase())).map((m) => m.userId);

    const comment = await this.repo.prisma.$transaction(async (tx) => {
      const created = await this.repo.createComment(tx, { taskId: task.id, authorId: actorId, body, mentions: mentioned });
      await recordEvent(tx, taskEvent(project, task, actorId, 'task.commented', { commentId: created.id }));
      for (const userId of mentioned.filter((id) => id !== actorId)) {
        await recordEvent(tx, taskEvent(project, task, actorId, 'task.mentioned', { commentId: created.id, userId }));
      }
      return created;
    });
    return toComment(comment);
  }

  private async requireTask(project: ProjectContext, ref: string) {
    const task = await this.repo.findInProject(project.id, ref);
    if (!task) throw new NotFoundException('Task topilmadi');
    return task;
  }

  private require(project: ProjectContext, permissions: Permission[]) {
    const missing = [...new Set(permissions)].filter((p) => !project.permissions.includes(p));
    if (missing.length > 0) throw new ForbiddenException(`Bu amal uchun ruxsat yo‘q: ${missing.join(', ')}`);
  }

  private async assertMembers(project: ProjectContext, userIds: string[]) {
    if (!(await this.repo.allProjectMembers(project.id, userIds))) {
      throw new BadRequestException('Task faqat loyihadagi xodimlarga beriladi (mijozga emas). Avval ularni loyihaga qo‘shing');
    }
  }

  private async assertWritable(project: ProjectContext) {
    const { status } = await this.repo.projectState(project.id);
    if (status === 'ARCHIVED') throw new ConflictException('Loyiha arxivda. Avval uni arxivdan chiqaring');
  }
}
