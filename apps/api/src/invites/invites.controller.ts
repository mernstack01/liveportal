import { Body, Controller, Post } from '@nestjs/common';
import { z } from 'zod';
import type { AuthUser, WorkspaceContext } from '../auth/auth.types.js';
import { CurrentUser, CurrentWorkspace, RequirePermission } from '../auth/decorators.js';
import { parse } from '../common/zod.js';
import { InvitesService } from './invites.service.js';

const createInviteSchema = z.object({
  role: z.string().min(1).max(64).default('member'),
  note: z.string().max(200).optional(),
});

@Controller('invites')
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Post()
  @RequirePermission('member.invite')
  create(@Body() body: unknown, @CurrentUser() user: AuthUser, @CurrentWorkspace() workspace: WorkspaceContext) {
    const { role, note } = parse(createInviteSchema, body);
    return this.invites.create({
      workspaceId: workspace.id,
      roleName: role,
      note,
      createdById: user.id,
      inviterPermissions: workspace.permissions,
    });
  }
}
