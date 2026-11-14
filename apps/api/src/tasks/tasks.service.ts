import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Permission } from '@liveportal/shared';
import type { ProjectContext, WorkspaceContext } from '../auth/auth.types.js';
import { type DomainEvent, recordEvent } from '../events/outbox.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { CreateTaskDto, UpdateTaskDto } from './dto/task.dto.js';
import { extractMentions } from './mentions.js';
import { type CommentRow, type TaskRow, TasksRepository } from './tasks.repository.js';

type Person = TaskRow['assignee'];

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
    completedAt: t.completedAt,
    status: t.status,
    assignee: toPerson(t.assignee),
    reporter: toPerson(t.reporter),
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
      assigneeId: t.assigneeId,
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
    const { statusId, assigneeId, ...fields } = dto;
    if (assigneeId) this.require(project, ['task.assign']);

    const status = await this.repo.findStatus(project.id, statusId);
    if (!status) throw new BadRequestException('Bunday status bu loyihada yo‘q');
    const closing = CLOSED.has(status.category);
    if (closing) this.require(project, ['task.close']);
    if (assigneeId) await this.assertMember(project, assigneeId);

    const task = await this.repo.prisma.$transaction(async (tx) => {
      const number = await this.repo.nextNumber(tx, project.id);
      const created = await this.repo.create(tx, {
        ...fields,
        projectId: project.id,
        number,
        statusId: status.id,
        assigneeId: assigneeId ?? null,
        reporterId: actorId,
        completedAt: closing ? new Date() : null,
      });
      await recordEvent(tx, taskEvent(project, created, actorId, 'task.created', { status: status.name }));
      if (created.assigneeId) {
        await recordEvent(tx, taskEvent(project, created, actorId, 'task.assigned', { previousAssigneeId: null }));
      }
      return created;
    });
    return { ...toTask(task), comments: [] };
  }

  async update(project: ProjectContext, actorId: string, ref: string, dto: UpdateTaskDto) {
    await this.assertWritable(project);
    const task = await this.requireTask(project, ref);
    const { assigneeId, statusId, ...fields } = dto;

    const needed: Permission[] = [];
    if (Object.keys(fields).length > 0) needed.push('task.update');
    const assigneeChanged = assigneeId !== undefined && assigneeId !== task.assigneeId;
    if (assigneeChanged) needed.push('task.assign');

    const newStatus = statusId !== undefined && statusId !== task.statusId ? await this.repo.findStatus(project.id, statusId) : undefined;
    if (newStatus === null) throw new BadRequestException('Bunday status bu loyihada yo‘q');
    const wasClosed = CLOSED.has(task.status.category);
    const nowClosed = newStatus ? CLOSED.has(newStatus.category) : wasClosed;
    if (newStatus) needed.push('task.update');
    if (newStatus && (wasClosed || nowClosed)) needed.push('task.close');
    this.require(project, needed);
    if (assigneeChanged && assigneeId) await this.assertMember(project, assigneeId);

    const data: Prisma.TaskUncheckedUpdateInput = { ...fields };
    if (assigneeChanged) data.assigneeId = assigneeId;
    if (newStatus) {
      data.statusId = newStatus.id;
      if (wasClosed !== nowClosed) data.completedAt = nowClosed ? new Date() : null;
    }

    const updated = await this.repo.prisma.$transaction(async (tx) => {
      const saved = await this.repo.update(tx, task.id, data);
      if (Object.keys(fields).length > 0) {
        await recordEvent(tx, taskEvent(project, saved, actorId, 'task.updated', { fields: Object.keys(fields) }));
      }
      if (assigneeChanged) {
        await recordEvent(tx, taskEvent(project, saved, actorId, 'task.assigned', { previousAssigneeId: task.assigneeId }));
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

  private async assertMember(project: ProjectContext, userId: string) {
    if (!(await this.repo.isProjectMember(project.id, userId))) {
      throw new BadRequestException('Task faqat loyiha a’zosiga beriladi. Avval uni loyihaga qo‘shing');
    }
  }

  private async assertWritable(project: ProjectContext) {
    const { status } = await this.repo.projectState(project.id);
    if (status === 'ARCHIVED') throw new ConflictException('Loyiha arxivda. Avval uni arxivdan chiqaring');
  }
}
