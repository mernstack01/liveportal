import type { EventType } from '@liveportal/shared';
import type { Prisma } from '../generated/prisma/client.js';

export interface DomainEvent {
  workspaceId: string;
  type: EventType;
  actorId: string | null;
  entityType: 'project' | 'task' | 'message';
  entityId: string;
  payload: Prisma.InputJsonObject;
}

/**
 * Outbox: event biznes amal bilan bitta tranzaksiyada yoziladi (CLAUDE.md, 2-qoida).
 * `publishedAt` bo'sh qatorlarni keyin dispatcher (BullMQ) tarqatadi.
 */
export function recordEvent(tx: Prisma.TransactionClient, event: DomainEvent) {
  return tx.event.create({ data: event });
}
