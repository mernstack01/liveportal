import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { TaskActionsService } from './task-actions.service.js';
import { MyTasksController, TasksController } from './tasks.controller.js';
import { TasksRepository } from './tasks.repository.js';
import { TasksService } from './tasks.service.js';

@Module({
  imports: [AuthModule],
  controllers: [TasksController, MyTasksController],
  providers: [TasksService, TasksRepository, TaskActionsService],
  exports: [TasksService, TaskActionsService],
})
export class TasksModule {}
