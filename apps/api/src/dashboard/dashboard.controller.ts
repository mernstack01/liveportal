import { Controller, Get } from '@nestjs/common';
import type { WorkspaceContext } from '../auth/auth.types.js';
import { CurrentWorkspace, RequirePermission } from '../auth/decorators.js';
import { PrismaService } from '../db/prisma.service.js';
import { localDay, localMidnight, weekStart } from '../tasks/due.js';
import { aggregateDashboard, type Category } from './dashboard.aggregate.js';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Arxivlanmagan loyihalar va ularning tasklari xotirada hisoblanadi: pilot hajmida (yuzlab task) yetarli.
   * Tasklar minglab bo'lganda SQL agregatsiyaga o'tkaziladi.
   */
  @Get()
  @RequirePermission('dashboard.view_all')
  async get(@CurrentWorkspace() workspace: WorkspaceContext) {
    const now = new Date();
    const today = localDay(now);
    const weekStartDay = weekStart(today);
    const [projects, tasks, members] = await Promise.all([
      this.prisma.project.findMany({
        where: { workspaceId: workspace.id, status: { not: 'ARCHIVED' } },
        select: { id: true, key: true, name: true, status: true, dueDate: true },
      }),
      this.prisma.task.findMany({
        where: { project: { workspaceId: workspace.id, status: { not: 'ARCHIVED' } } },
        select: {
          id: true,
          number: true,
          title: true,
          projectId: true,
          dueDate: true,
          dueTime: true,
          completedAt: true,
          assigneeId: true,
          status: { select: { category: true } },
        },
      }),
      this.prisma.workspaceMember.findMany({
        where: { workspaceId: workspace.id },
        select: { userId: true, role: { select: { name: true } }, user: { select: { name: true, avatarUrl: true } } },
      }),
    ]);

    return aggregateDashboard({
      today,
      weekStartDay,
      weekStart: localMidnight(weekStartDay),
      now,
      projects,
      tasks: tasks.map(({ status, ...t }) => ({ ...t, category: status.category as Category })),
      members: members.map((m) => ({ userId: m.userId, name: m.user.name, avatarUrl: m.user.avatarUrl, role: m.role.name })),
    });
  }
}
