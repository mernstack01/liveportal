import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import type { AuthUser, WorkspaceContext } from '../auth/auth.types.js';
import { CurrentUser, CurrentWorkspace, RequireMembership } from '../auth/decorators.js';
import { parse } from '../common/zod.js';
import { RolesService } from './roles.service.js';

const roleSchema = z.object({
  title: z.string().trim().min(2).max(60),
  permissions: z.array(z.string().min(1).max(64)).max(30),
});

/** Ruxsat (role.manage) service'da tekshiriladi: teamlead uni loyiha rolida oladi. */
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequireMembership()
  list(@CurrentUser() user: AuthUser, @CurrentWorkspace() workspace: WorkspaceContext) {
    return this.roles.list(workspace, user.id);
  }

  @Post()
  @RequireMembership()
  create(@Body() body: unknown, @CurrentUser() user: AuthUser, @CurrentWorkspace() workspace: WorkspaceContext) {
    return this.roles.create(workspace, user.id, parse(roleSchema, body));
  }

  @Patch(':roleId')
  @RequireMembership()
  update(@Param('roleId') roleId: string, @Body() body: unknown, @CurrentUser() user: AuthUser, @CurrentWorkspace() workspace: WorkspaceContext) {
    return this.roles.update(workspace, user.id, roleId, parse(roleSchema.partial(), body));
  }

  @Delete(':roleId')
  @HttpCode(204)
  @RequireMembership()
  remove(@Param('roleId') roleId: string, @CurrentUser() user: AuthUser, @CurrentWorkspace() workspace: WorkspaceContext) {
    return this.roles.remove(workspace, user.id, roleId);
  }
}
