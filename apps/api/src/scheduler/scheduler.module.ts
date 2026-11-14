import { Module } from '@nestjs/common';
import { DeadlineJob } from './deadline.job.js';
import { MorningJob } from './morning.job.js';
import { SchedulerService } from './scheduler.service.js';

@Module({
  providers: [MorningJob, DeadlineJob, SchedulerService],
  exports: [MorningJob, DeadlineJob, SchedulerService],
})
export class SchedulerModule {}
