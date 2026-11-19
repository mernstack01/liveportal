import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { localHour } from '../tasks/due.js';
import { DeadlineJob } from './deadline.job.js';
import { DealStepJob } from './deal-step.job.js';
import { MorningJob } from './morning.job.js';

/**
 * Har daqiqada: soatli muddatlarni tekshiradi (DeadlineJob) va Toshkent vaqti DIGEST_HOUR dan o'tgan bo'lsa,
 * ertalabki ishni chaqiradi.
 * Ish kuniga bir marta bajariladi (JobRun), shuning uchun server 09:00 da o'chiq bo'lsa ham, yoqilganda bajariladi.
 */
@Injectable()
export class SchedulerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SchedulerService.name);
  private timer?: NodeJS.Timeout;
  private running?: Promise<unknown>;

  constructor(
    private readonly morning: MorningJob,
    private readonly deadlines: DeadlineJob,
    private readonly dealSteps: DealStepJob,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onApplicationBootstrap(): void {
    const intervalMs = this.config.get('SCHEDULER_POLL_MS', { infer: true });
    if (intervalMs <= 0) return;
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref();
    setTimeout(() => void this.tick(), 5_000).unref(); // ishga tushganda ham bir marta
  }

  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.timer);
    await this.running;
  }

  async tick(now = new Date()): Promise<void> {
    if (this.running) return;
    const morning = localHour(now) >= this.config.get('DIGEST_HOUR', { infer: true });
    this.running = (async () => {
      await this.deadlines.run(now);
      await this.dealSteps.run(now);
      if (morning) await this.morning.run(now);
    })();
    try {
      await this.running;
    } catch (error) {
      this.logger.error(`Ertalabki ish xato berdi (keyingi daqiqada qayta): ${String(error)}`);
    } finally {
      this.running = undefined;
    }
  }
}
