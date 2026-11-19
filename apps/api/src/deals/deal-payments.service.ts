import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { WorkspaceContext } from '../auth/auth.types.js';
import { PrismaService } from '../db/prisma.service.js';
import { recordEvent } from '../events/outbox.js';
import { FileLinksService } from '../files/file-links.service.js';
import { attachmentRows, discardUploads, toAttachment } from '../files/uploads.js';
import { Prisma } from '../generated/prisma/client.js';
import type { CreatePaymentDto } from './deal.dto.js';
import { checkDealReady, DealsService } from './deals.service.js';

const person = { select: { id: true, name: true } } as const;
export const paymentInclude = { createdBy: person, confirmedBy: person, receipts: { orderBy: { createdAt: 'asc' } } } satisfies Prisma.DealPaymentInclude;
type PaymentRow = Prisma.DealPaymentGetPayload<{ include: typeof paymentInclude }>;

export function toPayment(p: PaymentRow, links: FileLinksService) {
  return {
    id: p.id,
    amount: p.amount.toString(),
    currency: p.currency,
    method: p.method,
    kind: p.kind,
    status: p.status,
    paidAt: p.paidAt.toISOString().slice(0, 10),
    note: p.note,
    createdBy: p.createdBy ? { userId: p.createdBy.id, name: p.createdBy.name } : null,
    confirmedBy: p.confirmedBy ? { userId: p.confirmedBy.id, name: p.confirmedBy.name } : null,
    confirmedAt: p.confirmedAt,
    rejectReason: p.rejectReason,
    receipts: p.receipts.map((a) => toAttachment(a, links)),
    createdAt: p.createdAt,
  };
}

const METHOD = { CASH: 'naqd', CARD: 'plastik' } as const;

/**
 * Kelishuv to'lovlari. Plastik — chek (fayl) majburiy, darhol hisoblanadi. Naqd — rahbar (`payment.confirm`)
 * tasdiqlagandan keyingina "to'langan"ga qo'shiladi. Har to'lov tarixga yoziladi; avans yetarli bo'lsa — rahbarga xabar.
 */
@Injectable()
export class DealPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deals: DealsService,
    private readonly links: FileLinksService,
  ) {}

  async list(workspace: WorkspaceContext, userId: string, ref: string) {
    const deal = await this.deals.findVisible(workspace, userId, ref);
    const rows = await this.prisma.dealPayment.findMany({ where: { dealId: deal.id }, include: paymentInclude, orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }] });
    return rows.map((p) => toPayment(p, this.links));
  }

  async create(workspace: WorkspaceContext, userId: string, ref: string, dto: CreatePaymentDto, files: Express.Multer.File[]) {
    try {
      const deal = await this.deals.findVisible(workspace, userId, ref);
      if (deal.stage === 'LOST') throw new BadRequestException('Yo‘qotilgan kelishuvga to‘lov yozilmaydi — avval qayta oching');
      if (dto.method === 'CARD' && files.length === 0) throw new BadRequestException('Plastik to‘lov uchun chek (skrinshot yoki fayl) biriktiring');
      const receipts = await attachmentRows(files, { workspaceId: workspace.id, projectId: deal.projectId, uploaderId: userId });
      const card = dto.method === 'CARD';
      const now = new Date();

      const payment = await this.prisma.$transaction(async (tx) => {
        const created = await tx.dealPayment.create({
          data: {
            dealId: deal.id,
            amount: dto.amount,
            currency: deal.currency,
            method: dto.method,
            kind: dto.kind,
            status: card ? 'CONFIRMED' : 'PENDING',
            paidAt: dto.paidAt ?? new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`),
            note: dto.note || null,
            createdById: userId,
            confirmedAt: card ? now : null,
            receipts: { create: receipts },
          },
          include: paymentInclude,
        });
        await tx.dealActivity.create({
          data: { dealId: deal.id, authorId: userId, kind: 'payment', to: `${created.amount.toString()} ${deal.currency}`, from: dto.method, body: dto.note || null },
        });
        await recordEvent(tx, {
          workspaceId: workspace.id,
          type: 'deal.payment_added',
          actorId: userId,
          entityType: 'deal',
          entityId: deal.id,
          payload: { number: deal.number, ownerId: deal.ownerId, paymentId: created.id, method: dto.method },
        });
        if (card) await checkDealReady(tx, deal.id, userId);
        return created;
      });
      return toPayment(payment, this.links);
    } catch (error) {
      await discardUploads(files);
      throw error;
    }
  }

  /** Naqd to'lovni tasdiqlash: rahbar (`payment.confirm`). Telegram tugmasidan ham chaqiriladi. */
  async confirm(workspace: WorkspaceContext, userId: string, paymentId: string) {
    const payment = await this.pending(workspace, paymentId);
    const saved = await this.prisma.$transaction(async (tx) => {
      // Ikki marta bosilsa ham bir marta: faqat PENDING holatdagisi o'zgaradi.
      const changed = await tx.dealPayment.updateMany({ where: { id: payment.id, status: 'PENDING' }, data: { status: 'CONFIRMED', confirmedById: userId, confirmedAt: new Date() } });
      if (changed.count === 0) throw new BadRequestException('Bu to‘lov allaqachon ko‘rib chiqilgan');
      await tx.dealActivity.create({ data: { dealId: payment.dealId, authorId: userId, kind: 'payment_confirmed', to: `${payment.amount.toString()} ${payment.currency}` } });
      await recordEvent(tx, {
        workspaceId: workspace.id,
        type: 'deal.payment_confirmed',
        actorId: userId,
        entityType: 'deal',
        entityId: payment.dealId,
        payload: { number: payment.deal.number, ownerId: payment.deal.ownerId, paymentId: payment.id, createdById: payment.createdById },
      });
      await checkDealReady(tx, payment.dealId, userId);
      return tx.dealPayment.findUniqueOrThrow({ where: { id: payment.id }, include: paymentInclude });
    });
    return toPayment(saved, this.links);
  }

  async reject(workspace: WorkspaceContext, userId: string, paymentId: string, reason: string) {
    const payment = await this.pending(workspace, paymentId);
    const saved = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.dealPayment.updateMany({ where: { id: payment.id, status: 'PENDING' }, data: { status: 'REJECTED', confirmedById: userId, confirmedAt: new Date(), rejectReason: reason } });
      if (changed.count === 0) throw new BadRequestException('Bu to‘lov allaqachon ko‘rib chiqilgan');
      await tx.dealActivity.create({ data: { dealId: payment.dealId, authorId: userId, kind: 'payment_rejected', to: `${payment.amount.toString()} ${payment.currency}`, body: reason } });
      await recordEvent(tx, {
        workspaceId: workspace.id,
        type: 'deal.payment_rejected',
        actorId: userId,
        entityType: 'deal',
        entityId: payment.dealId,
        payload: { number: payment.deal.number, ownerId: payment.deal.ownerId, paymentId: payment.id, createdById: payment.createdById },
      });
      return tx.dealPayment.findUniqueOrThrow({ where: { id: payment.id }, include: paymentInclude });
    });
    return toPayment(saved, this.links);
  }

  private async pending(workspace: WorkspaceContext, paymentId: string) {
    if (!workspace.permissions.includes('payment.confirm')) throw new ForbiddenException('Naqd to‘lovni faqat rahbar tasdiqlaydi');
    const payment = await this.prisma.dealPayment.findFirst({
      where: { id: paymentId, deal: { workspaceId: workspace.id } },
      include: { deal: { select: { number: true, ownerId: true } } },
    });
    if (!payment) throw new NotFoundException('To‘lov topilmadi');
    if (payment.status !== 'PENDING') throw new BadRequestException(`Bu to‘lov allaqachon ${payment.status === 'CONFIRMED' ? 'tasdiqlangan' : 'rad etilgan'}`);
    if (payment.method !== 'CASH') throw new BadRequestException(`Tasdiq faqat naqd to‘lovga kerak (bu — ${METHOD[payment.method]})`);
    return payment;
  }
}
