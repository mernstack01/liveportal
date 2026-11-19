import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../db/prisma.service.js';
import { ACTIVE_STAGES } from '../deals/deal.dto.js';
import { recordEvent } from '../events/outbox.js';

/** Eslatmadan keyin shuncha vaqt o'tib ham qadam yangilanmasa — rahbarga. */
export const DEAL_ESCALATE_MS = 24 * 3_600_000;

/**
 * Kelishuvlarning "keyingi qadam"i: vaqti kelganda mas'ulga (`deal.step_due`), eslatmadan 24 soat o'tib ham
 * yangi qadam qo'yilmasa — rahbarga (`deal.step_overdue`). Har qadam uchun bir martadan:
 * qadam yangilanganda `stepRemindedAt`/`stepEscalatedAt` tozalanadi (DealsService.update).
 */
@Injectable()
export class DealStepJob {
  private readonly logger = new Logger(DealStepJob.name);

  constructor(private readonly prisma: PrismaService) {}

  async run(now = new Date()): Promise<{ reminded: number; escalated: number }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('liveportal:deal-step-job'))`;
      const active = { stage: { in: [...ACTIVE_STAGES] } };
      const select = { id: true, workspaceId: true, number: true, ownerId: true } as const;

      const due = await tx.deal.findMany({ where: { ...active, nextStepAt: { lte: now }, stepRemindedAt: null }, select });
      for (const d of due) {
        await tx.deal.update({ where: { id: d.id }, data: { stepRemindedAt: now } });
        await recordEvent(tx, { workspaceId: d.workspaceId, type: 'deal.step_due', actorId: null, entityType: 'deal', entityId: d.id, payload: { number: d.number, ownerId: d.ownerId } });
      }

      const stale = await tx.deal.findMany({
        where: { ...active, stepRemindedAt: { lte: new Date(now.getTime() - DEAL_ESCALATE_MS) }, stepEscalatedAt: null },
        select,
      });
      for (const d of stale) {
        await tx.deal.update({ where: { id: d.id }, data: { stepEscalatedAt: now } });
        await recordEvent(tx, { workspaceId: d.workspaceId, type: 'deal.step_overdue', actorId: null, entityType: 'deal', entityId: d.id, payload: { number: d.number, ownerId: d.ownerId } });
      }
      if (due.length + stale.length > 0) this.logger.log(`Kelishuv qadamlari: ${due.length} ta eslatma, ${stale.length} ta rahbarga`);
      return { reminded: due.length, escalated: stale.length };
    });
  }
}
