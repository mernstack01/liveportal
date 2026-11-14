import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import type { AuthUser, ProjectContext, WorkspaceContext } from '../auth/auth.types.js';
import {
  CurrentProject,
  CurrentUser,
  CurrentWorkspace,
  RequireMembership,
  RequirePermission,
  RequireProjectAccess,
} from '../auth/decorators.js';
import { parse } from '../common/zod.js';
import {
  addMemberSchema,
  changeMemberRoleSchema,
  createProjectSchema,
  listProjectsQuery,
  updateProjectSchema,
} from './dto/project.dto.js';
import { ProjectsService } from './projects.service.js';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @RequireMembership()
  list(@Query() query: unknown, @CurrentUser() user: AuthUser, @CurrentWorkspace() workspace: WorkspaceContext) {
    const { archived } = parse(listProjectsQuery, query);
    return this.projects.list(workspace, user.id, archived);
  }

  @Post()
  @RequirePermission('project.create')
  create(@Body() body: unknown, @CurrentUser() user: AuthUser, @CurrentWorkspace() workspace: WorkspaceContext) {
    return this.projects.create(workspace, user.id, parse(createProjectSchema, body));
  }

  @Get(':projectId')
  @RequireProjectAccess()
  get(@CurrentProject() project: ProjectContext) {
    return this.projects.get(project);
  }

  @Patch(':projectId')
  @RequireProjectAccess('project.update')
  update(@Body() body: unknown, @CurrentUser() user: AuthUser, @CurrentProject() project: ProjectContext) {
    return this.projects.update(project, user.id, parse(updateProjectSchema, body));
  }

  @Post(':projectId/members')
  @RequireProjectAccess('project.member.manage')
  addMember(@Body() body: unknown, @CurrentUser() user: AuthUser, @CurrentProject() project: ProjectContext) {
    return this.projects.addMember(project, user.id, parse(addMemberSchema, body));
  }

  @Patch(':projectId/members/:userId')
  @RequireProjectAccess('project.member.manage')
  changeMemberRole(
    @Param('userId') userId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
    @CurrentProject() project: ProjectContext,
  ) {
    const { role } = parse(changeMemberRoleSchema, body);
    return this.projects.changeMemberRole(project, user.id, userId, role);
  }

  @Delete(':projectId/members/:userId')
  @HttpCode(204)
  @RequireProjectAccess('project.member.manage')
  removeMember(@Param('userId') userId: string, @CurrentUser() user: AuthUser, @CurrentProject() project: ProjectContext) {
    return this.projects.removeMember(project, user.id, userId);
  }
}
