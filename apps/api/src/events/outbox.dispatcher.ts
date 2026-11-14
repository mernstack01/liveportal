import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { PrismaService } from '../db/prisma.service.js';
import { EventBus } from './event-bus.js';

/**
 * Outbox dispatcher: `publishedAt IS NULL` eventlarni olib, obunachilarga tarqatadi va belgilaydi.
 * `FOR UPDATE SKIP LOCKED` — bir nechta API nusxasi ishlasa ham har event bir marta olinadi.
 * Redis/BullMQ shart emas: navbat PostgreSQL'ning o'zida (event bilan bir tranzaksiyada yozilgan).
 */
@Injectable()
export class OutboxDispatcher implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxDispatcher.name);
  private timer?: NodeJS.Timeout;
  private running?: Promise<number>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bus: EventBus,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onApplicationBootstrap(): void {
    const intervalMs = this.config.get('OUTBOX_POLL_MS', { infer: true });
    if (intervalMs <= 0) return; // testlarda drain() qo'lda chaqiriladi
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.timer);
    await this.running;
  }

  /** Navbatdagi eventlarni tugaguncha tarqatadi. Qaytaradi: nechta event yetkazildi. */
  async drain(batchSize = 100): Promise<number> {
    let total = 0;
    for (;;) {
      const count = await this.publishBatch(batchSize);
      total += count;
      if (count < batchSize) return total;
    }
  }

  private async tick(): Promise<void> {
    if (this.running) return; // oldingi aylanish hali tugamagan
    this.running = this.drain();
    try {
      await this.running;
    } catch (error) {
      this.logger.error(`Outbox aylanishi xato berdi: ${String(error)}`);
    } finally {
      this.running = undefined;
    }
  }

  private publishBatch(limit: number): Promise<number> {
    return this.prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM "Event"
          WHERE "publishedAt" IS NULL
          ORDER BY "createdAt", id
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED`;
        if (locked.length === 0) return 0;

        const ids = locked.map((r) => r.id);
        const events = await tx.event.findMany({ where: { id: { in: ids } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
        for (const event of events) {
          const failed = await this.bus.dispatch(event, tx);
          this.logger.debug(`${event.type} ${event.entityType}:${event.entityId}${failed ? ` (${failed} obunachi xato)` : ''}`);
        }
        await tx.event.updateMany({ where: { id: { in: ids } }, data: { publishedAt: new Date() } });
        return events.length;
      },
      { timeout: 60_000 },
    );
  }
}
