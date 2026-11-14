import { Injectable, Logger } from '@nestjs/common';
import type { EventType } from '@liveportal/shared';
import type { Event, Prisma } from '../generated/prisma/client.js';

/**
 * `tx` — dispatcher tranzaksiyasi: obunachi yozgan qatorlar (masalan, Notification) event "yetkazildi"
 * deb belgilanishi bilan birga saqlanadi yoki birga bekor bo'ladi.
 */
export type EventHandler = (event: Event, tx: Prisma.TransactionClient) => Promise<void> | void;

/**
 * Jarayon ichidagi obunachilar ro'yxati. Modullar bir-birini chaqirmaydi, eventga obuna bo'ladi
 * (docs/05: notification, activity, dashboard). Eventlarni bazadan OutboxDispatcher yetkazadi.
 */
@Injectable()
export class EventBus {
  private readonly logger = new Logger(EventBus.name);
  private readonly handlers = new Map<EventType | '*', { name: string; handle: EventHandler }[]>();

  /** `name` logda ko'rinadi: qaysi obunachi xato berganini topish uchun. */
  subscribe(type: EventType | '*', name: string, handle: EventHandler): void {
    const list = this.handlers.get(type) ?? [];
    list.push({ name, handle });
    this.handlers.set(type, list);
  }

  /**
   * Obunachilar ketma-ket chaqiriladi. Bittasi xato bersa, qolganlari baribir ishlaydi va
   * event "yetkazildi" deb belgilanadi: bitta buzuq obunachi navbatni to'xtatib qo'ymasligi kerak.
   * Qayta urinish kerak bo'lgan ish (Telegram'ga yuborish) obunachining o'z navbatida (BullMQ, 7-kun).
   */
  async dispatch(event: Event, tx: Prisma.TransactionClient): Promise<number> {
    const targets = [...(this.handlers.get(event.type as EventType) ?? []), ...(this.handlers.get('*') ?? [])];
    let failed = 0;
    for (const { name, handle } of targets) {
      try {
        await handle(event, tx);
      } catch (error) {
        failed += 1;
        this.logger.error(`${name} obunachisi ${event.type} (${event.id}) da xato berdi: ${String(error)}`);
      }
    }
    return failed;
  }
}
