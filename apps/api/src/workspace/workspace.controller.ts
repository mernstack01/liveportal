import { Body, Controller, Delete, Get, HttpCode, Param, Patch } from '@nestjs/common';
import { z } from 'zod';
import type { AuthUser, WorkspaceContext } from '../auth/auth.types.js';
import { CurrentUser, CurrentWorkspace, RequirePermission } from '../auth/decorators.js';
import { parse } from '../common/zod.js';
import { MembersService } from './members.service.js';

const changeRoleSchema = z.object({ role: z.string().min(1).max(64) });

@Controller('workspace')
export class WorkspaceController {
  constructor(private readonly members: MembersService) {}

  /** Hamkasblar ro'yxati: loyihaga qo'shish va task berish uchun. Telegram ID qaytarilmaydi. Mijoz ko'rmaydi. */
  @Get('members')
  @RequirePermission('team.view')
  list(@CurrentWorkspace() workspace: WorkspaceContext, @CurrentUser() user: AuthUser) {
    return this.members.list(workspace, user.id);
  }

  /** Workspace rolini o'zgartirish (A'zo, Admin, Mijoz, Rahbar). */
  @Patch('members/:userId')
  @RequirePermission('member.role.assign')
  changeRole(@Param('userId') userId: string, @Body() body: unknown, @CurrentWorkspace() workspace: WorkspaceContext, @CurrentUser() user: AuthUser) {
    return this.members.changeRole(workspace, user.id, userId, parse(changeRoleSchema, body).role);
  }

  /** Chiqarish: sessiyalar yopiladi, loyihalar, tasklar va insidentlardagi mas'ullikdan olinadi. */
  @Delete('members/:userId')
  @RequirePermission('member.remove')
  @HttpCode(200)
  remove(@Param('userId') userId: string, @CurrentWorkspace() workspace: WorkspaceContext, @CurrentUser() user: AuthUser) {
    return this.members.remove(workspace, user.id, userId);
  }
}
