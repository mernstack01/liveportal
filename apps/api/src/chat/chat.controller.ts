import { Body, Controller, Get, Param, Patch, Post, Query, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import type { AuthUser, ProjectContext } from '../auth/auth.types.js';
import { CurrentProject, CurrentUser, RequireProjectAccess } from '../auth/decorators.js';
import { parse } from '../common/zod.js';
import { ChatService } from './chat.service.js';

const listQuery = z.object({ before: z.string().min(1).max(64).optional() });

/** "Jamoa" chati: faqat xodimlar. */
@Controller('projects/:projectId/chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  @RequireProjectAccess('message.internal.read')
  list(@Query() query: unknown, @CurrentProject() project: ProjectContext) {
    return this.chat.list(project, 'internal', parse(listQuery, query).before);
  }

  /** JSON ({ body }) yoki multipart (body + files[], 10 tagacha). Ruxsat guard'da — fayl saqlanishidan oldin. */
  @Post()
  @RequireProjectAccess('message.internal.write')
  @UseInterceptors(FilesInterceptor('files', 10))
  post(@UploadedFiles() files: Express.Multer.File[] | undefined, @Body() body: unknown, @CurrentUser() user: AuthUser, @CurrentProject() project: ProjectContext) {
    return this.chat.post(project, 'internal', user.id, body, files ?? []);
  }

  @Patch(':messageId')
  @RequireProjectAccess('message.internal.write')
  edit(@Param('messageId') messageId: string, @Body() body: unknown, @CurrentUser() user: AuthUser, @CurrentProject() project: ProjectContext) {
    return this.chat.edit(project, 'internal', user.id, messageId, body);
  }
}

/** "Mijoz bilan" chati: mijoz (mehmon) va unga javob beradigan xodimlar. */
@Controller('projects/:projectId/client-chat')
export class ClientChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  @RequireProjectAccess('message.external.read')
  list(@Query() query: unknown, @CurrentProject() project: ProjectContext) {
    return this.chat.list(project, 'client', parse(listQuery, query).before);
  }

  @Post()
  @RequireProjectAccess('message.external.write')
  @UseInterceptors(FilesInterceptor('files', 10))
  post(@UploadedFiles() files: Express.Multer.File[] | undefined, @Body() body: unknown, @CurrentUser() user: AuthUser, @CurrentProject() project: ProjectContext) {
    return this.chat.post(project, 'client', user.id, body, files ?? []);
  }

  @Patch(':messageId')
  @RequireProjectAccess('message.external.write')
  edit(@Param('messageId') messageId: string, @Body() body: unknown, @CurrentUser() user: AuthUser, @CurrentProject() project: ProjectContext) {
    return this.chat.edit(project, 'client', user.id, messageId, body);
  }
}
