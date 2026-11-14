import { HttpException, Injectable } from '@nestjs/common';
import { AccessService } from '../auth/access.service.js';
import { PrismaService } from '../db/prisma.service.js';
import { TasksService } from './tasks.service.js';

export type TaskAction = 'start' | 'review';

const TARGET: Record<TaskAction, 'IN_PROGRESS' | 'REVIEW'> = { start: 'IN_PROGRESS', review: 'REVIEW' };

/** Telegram tugmasi orqali kelgan amal: odam bot orqali, ruxsat esa web'dagidek tekshiriladi. */
export class TaskActionError extends Error {}

@Injectable()
export class TaskActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly tasks: TasksService,
  ) {}

  /** Qaytaradi: Telegram'da ko'rsatiladigan qisqa javob. */
  async apply(telegramId: number, taskId: string, action: TaskAction): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) }, select: { id: true } });
    if (!user) throw new TaskActionError('Siz tizimda yo‘qsiz.');
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, number: true, projectId: true, statusId: true, project: { select: { key: true } } },
    });
    if (!task) throw new TaskActionError('Task topilmadi.');

    try {
      const workspace = await this.access.workspaceFor(user.id);
      const project = await this.access.projectFor(workspace, user.id, task.projectId);
      const target = await this.prisma.workflowStatus.findFirst({
        where: { projectId: task.projectId, category: TARGET[action] },
        orderBy: { order: 'asc' },
      });
      if (!target) throw new TaskActionError('Loyihada bunday holat yo‘q.');
      const key = `${task.project.key}-${task.number}`;
      if (target.id === task.statusId) return `${key} allaqachon «${target.name}» da.`;

      await this.tasks.update(project, user.id, task.id, { statusId: target.id });
      return `${key} → «${target.name}» ✅`;
    } catch (error) {
      if (error instanceof HttpException) {
        const body = error.getResponse();
        const message = typeof body === 'object' && 'message' in body && typeof body.message === 'string' ? body.message : error.message;
        throw new TaskActionError(message);
      }
      throw error;
    }
  }
}
