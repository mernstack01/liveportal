import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import type { AuthUser, ProjectContext } from '../auth/auth.types.js';
import { CurrentProject, CurrentUser, RequireProjectAccess } from '../auth/decorators.js';
import { parse } from '../common/zod.js';
import { ChatService } from './chat.service.js';

@Controller('projects/:projectId/chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  @RequireProjectAccess('message.internal.read')
  list(@Query() query: unknown, @CurrentProject() project: ProjectContext) {
    const { before } = parse(z.object({ before: z.string().min(1).max(64).optional() }), query);
    return this.chat.list(project, before);
  }

  @Post()
  @RequireProjectAccess('message.internal.write')
  post(@Body() body: unknown, @CurrentUser() user: AuthUser, @CurrentProject() project: ProjectContext) {
    return this.chat.post(project, user.id, parse(z.object({ body: z.string().trim().min(1).max(4000) }), body).body);
  }
}
