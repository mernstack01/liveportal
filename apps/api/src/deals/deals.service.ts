import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { memberPermissions } from '../auth/access.service.js';
import type { WorkspaceContext } from '../auth/auth.types.js';
import { PrismaService } from '../db/prisma.service.js';
import { recordEvent } from '../events/outbox.js';
import { FileLinksService } from '../files/file-links.service.js';
import { attachmentRows, discardUploads, toAttachment } from '../files/uploads.js';
import { Prisma, type DealStage } from '../generated/prisma/client.js';
import { ACTIVE_STAGES, type CreateDealDto, type UpdateDealDto } from './deal.dto.js';

const person = { select: { id: true, name: true, telegramUsername: true, avatarUrl: true } } as const;
const dealInclude = {
  owner: person,
  createdBy: person,
  project: { select: { id: true, key: true, name: true } },
  payments: { select: { amount: true, status: true } },
} satisfies Prisma.DealInclude;
type DealRow = Prisma.DealGetPayload<{ include: typeof dealInclude }>;
type PersonRow = DealRow['owner'];

/** Yopilgan (yutilgan/yo'qotilgan) kelishuvlar boardda shuncha kun ko'rinadi. */
const CLOSED_VISIBLE_DAYS = 60;

const isActive = (stage: DealStage) => (ACTIVE_STAGES as readonly string[]).includes(stage);
const toPerson = (u: PersonRow) => (u ? { userId: u.id, name: u.name, telegramUsername: u.telegramUsername, avatarUrl: u.avatarUrl } : null);
const dayString = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const money = (amount: Prisma.Decimal | string | null, currency: string) => (amount === null ? null : `${amount.toString()} ${currency}`);

/**
 * Pul holati: to'langan (tasdiqlangan), tasdiq kutayotgan (naqd), loyiha boshlanishi uchun kerakli avans va qolgan qarz.
 * Hisob Decimal'da (kasr xatosisiz), javobda — satr.
 */
export function dealMoney(d: { amount: Prisma.Decimal | null; advancePercent: number; payments: { amount: Prisma.Decimal; status: string }[] }) {
  const sum = (status: string) => d.payments.filter((p) => p.status === status).reduce((acc, p) => acc.plus(p.amount), new Prisma.Decimal(0));
  const paid = sum('CONFIRMED');
  const advanceDue = d.amount ? d.amount.mul(d.advancePercent).div(100).toDecimalPlaces(2) : null;
  return {
    paid,
    pending: sum('PENDING'),
    advanceDue,
    remaining: d.amount ? Prisma.Decimal.max(d.amount.minus(paid), 0) : null,
    advanceReached: advanceDue !== null && paid.gte(advanceDue),
  };
}

export function toDeal(d: DealRow) {
  const m = dealMoney(d);
  return {
    id: d.id,
    number: d.number,
    key: `K-${d.number}`,
    title: d.title,
    clientName: d.clientName,
    clientContact: d.clientContact,
    source: d.source,
    description: d.description,
    /** Aniq qiymat satrda (Decimal); ko'rsatishda songa aylantiriladi. */
    amount: d.amount?.toString() ?? null,
    currency: d.currency,
    stage: d.stage,
    owner: toPerson(d.owner),
    createdBy: toPerson(d.createdBy),
    nextStep: d.nextStep,
    nextStepAt: d.nextStepAt,
    dueDate: dayString(d.dueDate),
    lostReason: d.lostReason,
    advancePercent: d.advancePercent,
    /** Pul: hammasi satrda (aniq qiymat). */
    paid: m.paid.toString(),
    pendingPayments: m.pending.toString(),
    advanceDue: m.advanceDue?.toString() ?? null,
    remaining: m.remaining?.toString() ?? null,
    advanceReached: m.advanceReached,
    project: d.project,
    stageChangedAt: d.stageChangedAt,
    closedAt: d.closedAt,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

/**
 * Avans yetarli bo'ldimi: bo'lsa (va hali aytilmagan bo'lsa), rahbarga "loyihani boshlaymizmi?" (`deal.ready`).
 * To'lov tasdiqlanganda, summa yoki avans foizi o'zgarganda chaqiriladi.
 */
export async function checkDealReady(tx: Prisma.TransactionClient, dealId: string, actorId: string | null) {
  const deal = await tx.deal.findUniqueOrThrow({ where: { id: dealId }, include: { payments: { select: { amount: true, status: true } } } });
  if (deal.readyNotifiedAt || !isActive(deal.stage) || !dealMoney(deal).advanceReached) return false;
  await tx.deal.update({ where: { id: dealId }, data: { readyNotifiedAt: new Date() } });
  // Muallif yo'q (tizim xabari): to'lovni tasdiqlagan rahbarning o'ziga ham borsin.
  await recordEvent(tx, { workspaceId: deal.workspaceId, type: 'deal.ready', actorId: null, entityType: 'deal', entityId: dealId, payload: { number: deal.number, ownerId: deal.ownerId, triggeredBy: actorId } });
  return true;
}

/** Kelishuvlarni ko'radigan rahbar(lar): `deal.view_all` asosiy yoki qo'shimcha rolda. */
export async function dealSupervisors(tx: Prisma.TransactionClient, workspaceId: string): Promise<string[]> {
  const has = { permissions: { has: 'deal.view_all' } };
  const rows = await tx.workspaceMember.findMany({
    where: { workspaceId, OR: [{ role: has }, { extraRoles: { some: { role: has } } }] },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

type Activity = { kind: string; from?: string | null; to?: string | null; body?: string | null };

/**
 * Kelishuvlar (savdo bo'limi). Ko'rinish: `deal.view_all` — hammasi, `deal.manage` — faqat o'zi mas'ul bo'lganlari.
 * Qoidalar: faol kelishuvda keyingi qadam majburiy; "Yo'qotildi" — sabab bilan; topshirish muddati o'zgarsa — sabab bilan;
 * "Yutildi" bu yerda qo'yilmaydi (avans va rahbar tasdig'i orqali loyiha ochilganda).
 */
@Injectable()
export class DealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly links: FileLinksService,
  ) {}

  /** `all` — barcha kelishuvlarni ko'radimi. Ikkala ruxsat ham yo'q bo'lsa — 403. */
  access(workspace: WorkspaceContext) {
    const all = workspace.permissions.includes('deal.view_all');
    if (!all && !workspace.permissions.includes('deal.manage')) throw new ForbiddenException('Kelishuvlar faqat savdo bo‘limiga ochiq');
    return { all };
  }

  async list(workspace: WorkspaceContext, userId: string, query: { ownerId?: string; q?: string }) {
    const { all } = this.access(workspace);
    const since = new Date(Date.now() - CLOSED_VISIBLE_DAYS * 86_400_000);
    const where: Prisma.DealWhereInput = {
      workspaceId: workspace.id,
      ownerId: all ? query.ownerId : userId,
      OR: [{ closedAt: null }, { closedAt: { gte: since } }],
    };
    if (query.q) {
      const contains = { contains: query.q, mode: 'insensitive' as const };
      const number = /^(k-)?\d+$/i.test(query.q) ? Number(query.q.replace(/^k-/i, '')) : null;
      where.AND = [{ OR: [{ title: contains }, { clientName: contains }, { clientContact: contains }, ...(number ? [{ number }] : [])] }];
    }
    const rows = await this.prisma.deal.findMany({ where, include: dealInclude, orderBy: [{ nextStepAt: 'asc' }, { createdAt: 'desc' }], take: 500 });
    return rows.map(toDeal);
  }

  /** Kimni mas'ul qilsa bo'ladi: savdo ruxsati bor xodimlar. */
  async owners(workspace: WorkspaceContext) {
    this.access(workspace);
    const rows = await this.prisma.workspaceMember.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { joinedAt: 'asc' },
      select: { role: { select: { permissions: true } }, extraRoles: { select: { role: { select: { permissions: true } } } }, user: person },
    });
    return rows.filter((m) => canOwn(memberPermissions(m))).map((m) => toPerson(m.user)!);
  }

  async get(workspace: WorkspaceContext, userId: string, ref: string) {
    const deal = await this.findVisible(workspace, userId, ref);
    const activities = await this.prisma.dealActivity.findMany({
      where: { dealId: deal.id },
      orderBy: { createdAt: 'asc' },
      include: { author: person, attachments: { orderBy: { createdAt: 'asc' } } },
    });
    return {
      ...toDeal(deal),
      activities: activities.map((a) => ({
        id: a.id,
        kind: a.kind,
        body: a.body,
        from: a.from,
        to: a.to,
        author: toPerson(a.author),
        attachments: a.attachments.map((f) => toAttachment(f, this.links)),
        createdAt: a.createdAt,
      })),
    };
  }

  async create(workspace: WorkspaceContext, userId: string, dto: CreateDealDto) {
    const { all } = this.access(workspace);
    const ownerId = dto.ownerId ?? userId;
    if (ownerId !== userId && !all) throw new ForbiddenException('Kelishuvni boshqa odamga faqat rahbar biriktiradi');
    await this.assertOwner(workspace, ownerId);

    const created = await this.prisma.$transaction(async (tx) => {
      const { dealCounter } = await tx.workspace.update({ where: { id: workspace.id }, data: { dealCounter: { increment: 1 } }, select: { dealCounter: true } });
      const deal = await tx.deal.create({
        data: {
          workspaceId: workspace.id,
          number: dealCounter,
          title: dto.title,
          clientName: dto.clientName,
          clientContact: dto.clientContact || null,
          source: dto.source,
          description: dto.description || null,
          amount: dto.amount ?? null,
          currency: dto.currency,
          ownerId,
          createdById: userId,
          nextStep: dto.nextStep,
          nextStepAt: dto.nextStepAt,
          dueDate: dto.dueDate ?? null,
          activities: { create: { authorId: userId, kind: 'created', to: dto.nextStep } },
        },
        include: dealInclude,
      });
      await recordEvent(tx, {
        workspaceId: workspace.id,
        type: 'deal.created',
        actorId: userId,
        entityType: 'deal',
        entityId: deal.id,
        payload: { number: deal.number, ownerId, createdById: userId },
      });
      return deal;
    });
    return toDeal(created);
  }

  async update(workspace: WorkspaceContext, userId: string, ref: string, dto: UpdateDealDto) {
    const { all } = this.access(workspace);
    const current = await this.findVisible(workspace, userId, ref);
    const data: Prisma.DealUncheckedUpdateInput = {
      title: dto.title,
      clientName: dto.clientName,
      clientContact: dto.clientContact,
      source: dto.source,
      description: dto.description,
    };
    const activities: Activity[] = [];
    const changes: Record<string, { from: string | null; to: string | null }> = {};

    if (dto.ownerId && dto.ownerId !== current.ownerId) {
      if (!all) throw new ForbiddenException('Mas’ulni faqat rahbar almashtiradi');
      await this.assertOwner(workspace, dto.ownerId);
      data.ownerId = dto.ownerId;
      changes.owner = { from: current.ownerId, to: dto.ownerId };
      activities.push({ kind: 'owner', from: current.ownerId, to: dto.ownerId });
    }

    const stage = dto.stage ?? current.stage;
    if (dto.stage && dto.stage !== current.stage) {
      if (dto.stage === 'WON') throw new BadRequestException('“Yutildi” — avans tushib, rahbar loyihani boshlashga “ha” deganda qo‘yiladi');
      if (current.stage === 'WON') throw new BadRequestException('Yutilgan kelishuvning bosqichi o‘zgarmaydi');
      if (dto.stage === 'LOST' && !dto.lostReason) throw new BadRequestException('Nima uchun yo‘qotildi — sababini yozing');
      data.stage = dto.stage;
      data.stageChangedAt = new Date();
      data.closedAt = dto.stage === 'LOST' ? new Date() : null;
      data.lostReason = dto.stage === 'LOST' ? dto.lostReason : null;
      changes.stage = { from: current.stage, to: dto.stage };
      activities.push({ kind: 'stage', from: current.stage, to: dto.stage, body: dto.stage === 'LOST' ? dto.lostReason : null });
    }

    const nextStep = dto.nextStep ?? current.nextStep;
    const nextStepAt = dto.nextStepAt ?? current.nextStepAt;
    const stepChanged = (dto.nextStep !== undefined && dto.nextStep !== current.nextStep) || (dto.nextStepAt !== undefined && dto.nextStepAt.getTime() !== current.nextStepAt?.getTime());
    if (stepChanged) {
      data.nextStep = nextStep;
      data.nextStepAt = nextStepAt;
      // Yangi vaqt: eslatmalar qaytadan.
      data.stepRemindedAt = null;
      data.stepEscalatedAt = null;
      activities.push({ kind: 'step', from: current.nextStep, to: nextStep, body: dto.stepResult || null });
    } else if (dto.stepResult) {
      activities.push({ kind: 'note', body: dto.stepResult });
    }
    if (isActive(stage) && (!nextStep || !nextStepAt)) throw new BadRequestException('Faol kelishuvda keyingi qadam va uning vaqti bo‘lishi shart');

    if (dto.dueDate !== undefined && dayString(dto.dueDate) !== dayString(current.dueDate)) {
      // Birinchi marta qo'yilsa — sababsiz; mavjud muddat o'zgarsa — sabab majburiy (rahbar ko'radi).
      if (current.dueDate && !dto.dueReason) throw new BadRequestException('Muddat nima uchun o‘zgarayotganini yozing');
      data.dueDate = dto.dueDate;
      changes.due = { from: dayString(current.dueDate), to: dayString(dto.dueDate) };
      activities.push({ kind: 'due', from: dayString(current.dueDate), to: dayString(dto.dueDate), body: dto.dueReason || null });
    }

    if (dto.advancePercent !== undefined && dto.advancePercent !== current.advancePercent) {
      data.advancePercent = dto.advancePercent;
      activities.push({ kind: 'advance', from: String(current.advancePercent), to: String(dto.advancePercent) });
    }

    const currency = dto.currency ?? current.currency;
    const amount = dto.amount !== undefined ? dto.amount : (current.amount?.toString() ?? null);
    const before = money(current.amount, current.currency);
    const after = money(amount, currency);
    if (before !== after) {
      if (currency !== current.currency && current.payments.length > 0) throw new BadRequestException('To‘lovlar bor: valyutani o‘zgartirib bo‘lmaydi');
      data.amount = amount;
      data.currency = currency;
      changes.amount = { from: before, to: after };
      activities.push({ kind: 'amount', from: before, to: after });
    }

    const saved = await this.prisma.$transaction(async (tx) => {
      const deal = await tx.deal.update({ where: { id: current.id }, data, include: dealInclude });
      if (activities.length > 0) {
        await tx.dealActivity.createMany({ data: activities.map((a) => ({ dealId: current.id, authorId: userId, ...a })) });
      }
      if (Object.keys(changes).length > 0) {
        await recordEvent(tx, {
          workspaceId: workspace.id,
          type: 'deal.updated',
          actorId: userId,
          entityType: 'deal',
          entityId: current.id,
          payload: { number: deal.number, ownerId: deal.ownerId, changes, reason: dto.dueReason ?? dto.lostReason ?? null },
        });
      }
      if (data.amount !== undefined || data.advancePercent !== undefined) await checkDealReady(tx, current.id, userId);
      return deal;
    });
    return toDeal(saved);
  }

  /** Qo'ng'iroq, uchrashuv yoki izoh — matn va/yoki fayllar (TZ, KP, shartnoma). Xato bo'lsa, fayllar o'chiriladi. */
  async addActivity(workspace: WorkspaceContext, userId: string, ref: string, kind: string, body: string, files: Express.Multer.File[] = []) {
    try {
      if (!body && files.length === 0) throw new BadRequestException('Matn yoki fayl kerak');
      const deal = await this.findVisible(workspace, userId, ref);
      const attachments = await attachmentRows(files, { workspaceId: workspace.id, projectId: null, uploaderId: userId });
      const activity = await this.prisma.$transaction(async (tx) => {
        const created = await tx.dealActivity.create({
          data: { dealId: deal.id, authorId: userId, kind, body: body || null, attachments: { create: attachments } },
          include: { author: person, attachments: true },
        });
        await tx.deal.update({ where: { id: deal.id }, data: { updatedAt: new Date() } });
        return created;
      });
      return {
        id: activity.id,
        kind: activity.kind,
        body: activity.body,
        from: null,
        to: null,
        author: toPerson(activity.author),
        attachments: activity.attachments.map((f) => toAttachment(f, this.links)),
        createdAt: activity.createdAt,
      };
    } catch (error) {
      await discardUploads(files);
      throw error;
    }
  }

  /** `ref` — raqam (K-12 uchun `12`) yoki id. Ko'rinmaydigan kelishuv — 404 (borligi ham bilinmasin). */
  async findVisible(workspace: WorkspaceContext, userId: string, ref: string) {
    const { all } = this.access(workspace);
    const number = /^\d+$/.test(ref) ? Number(ref) : null;
    const deal = await this.prisma.deal.findFirst({
      where: { workspaceId: workspace.id, ...(number !== null ? { number } : { id: ref }), ...(all ? {} : { ownerId: userId }) },
      include: dealInclude,
    });
    if (!deal) throw new NotFoundException('Kelishuv topilmadi');
    return deal;
  }

  private async assertOwner(workspace: WorkspaceContext, userId: string) {
    const member = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId } },
      select: { role: { select: { permissions: true } }, extraRoles: { select: { role: { select: { permissions: true } } } } },
    });
    if (!member || !canOwn(memberPermissions(member))) throw new BadRequestException('Mas’ul — savdo ruxsati bor xodim bo‘lishi kerak');
  }
}

function canOwn(permissions: string[]) {
  return permissions.includes('deal.manage') || permissions.includes('deal.view_all');
}
