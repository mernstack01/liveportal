import { Module } from '@nestjs/common';
import { DeadlineJob } from './deadline.job.js';
import { DealStepJob } from './deal-step.job.js';
import { MorningJob } from './morning.job.js';
import { SchedulerService } from './scheduler.service.js';

@Module({
  providers: [MorningJob, DeadlineJob, DealStepJob, SchedulerService],
  exports: [MorningJob, DeadlineJob, DealStepJob, SchedulerService],
})
export class SchedulerModule {}
