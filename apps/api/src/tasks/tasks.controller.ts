import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { AuthUser, ProjectContext, WorkspaceContext } from '../auth/auth.types.js';
import { CurrentProject, CurrentUser, CurrentWorkspace, RequireMembership, RequireProjectAccess } from '../auth/decorators.js';
import { parse } from '../common/zod.js';
import { createCommentSchema, createTaskSchema, listTasksQuery, myTasksQuery, updateTaskSchema } from './dto/task.dto.js';
import { TasksService } from './tasks.service.js';

@Controller('projects/:projectId/tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  @RequireProjectAccess()
  list(@Query() query: unknown, @CurrentUser() user: AuthUser, @CurrentProject() project: ProjectContext) {
    return this.tasks.list(project, user.id, parse(listTasksQuery, query));
  }

  @Post()
  @RequireProjectAccess('task.create')
  create(@Body() body: unknown, @CurrentUser() user: AuthUser, @CurrentProject() project: ProjectContext) {
    return this.tasks.create(project, user.id, parse(createTaskSchema, body));
  }

  /** `:taskRef` — task id yoki raqami (LP-12 uchun `12`). */
  @Get(':taskRef')
  @RequireProjectAccess()
  get(@Param('taskRef') ref: string, @CurrentProject() project: ProjectContext) {
    return this.tasks.get(project, ref);
  }

  /** Ruxsatlar maydon bo'yicha service'da tekshiriladi: task.update, task.assign, task.close. */
  @Patch(':taskRef')
  @RequireProjectAccess()
  update(@Param('taskRef') ref: string, @Body() body: unknown, @CurrentUser() user: AuthUser, @CurrentProject() project: ProjectContext) {
    return this.tasks.update(project, user.id, ref, parse(updateTaskSchema, body));
  }

  @Post(':taskRef/comments')
  @RequireProjectAccess('task.comment')
  comment(@Param('taskRef') ref: string, @Body() body: unknown, @CurrentUser() user: AuthUser, @CurrentProject() project: ProjectContext) {
    return this.tasks.comment(project, user.id, ref, parse(createCommentSchema, body).body);
  }
}

@Controller('tasks')
export class MyTasksController {
  constructor(private readonly tasks: TasksService) {}

  /** "Mening tasklarim": barcha loyihalardan menga berilgan ochiq tasklar, muddati yaqinlari oldin. */
  @Get('mine')
  @RequireMembership()
  mine(@Query() query: unknown, @CurrentUser() user: AuthUser, @CurrentWorkspace() workspace: WorkspaceContext) {
    return this.tasks.mine(workspace, user.id, parse(myTasksQuery, query).all);
  }
}
