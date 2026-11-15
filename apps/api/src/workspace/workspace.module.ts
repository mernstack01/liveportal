import { Module } from '@nestjs/common';
import { MembersService } from './members.service.js';
import { WorkspaceController } from './workspace.controller.js';

@Module({ controllers: [WorkspaceController], providers: [MembersService] })
export class WorkspaceModule {}
