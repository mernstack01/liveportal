import { ForbiddenException, Injectable } from '@nestjs/common';
import type { WorkspaceContext } from '../auth/auth.types.js';
import { PrismaService } from '../db/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { addDays, dayStart, localDay } from '../tasks/due.js';
import { ACTIVE_STAGES } from './deal.dto.js';
import { dealMoney } from './deals.service.js';

type Sums = Partial<Record<'UZS' | 'USD', string>>;

/** Valyutalar bo'yicha jami (nol bo'lganlari tushirib qoldiriladi). */
function sums(rows: { currency: string; amount: Prisma.Decimal | null }[]): Sums {
  const acc = new Map<string, Prisma.Decimal>();
  for (const r of rows) if (r.amount) acc.set(r.currency, (acc.get(r.currency) ?? new Prisma.Decimal(0)).plus(r.amount));
  return Object.fromEntries([...acc].filter(([, v]) => !v.isZero()).map(([k, v]) => [k, v.toString()])) as Sums;
}

const STALE_MS = 24 * 3_600_000;
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * Rahbar paneli (`deal.view_all`): pul (kutilayotgan, shu oy tushgan, qarzdorlik, tasdiq kutayotgan naqd),
 * savdo bosqichlari, unutilganlar, oy natijasi, muddat o'zgarishlari. Pilot hajmida xotirada hisoblanadi.
 */
@Injectable()
export class DealsSummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(workspace: WorkspaceContext, now = new Date()) {
    if (!workspace.permissions.includes('deal.view_all')) throw new ForbiddenException('Faqat rahbar uchun');
    const today = localDay(now);
    const monthStart = dayStart(`${today.slice(0, 7)}-01`);
    const since30 = dayStart(addDays(today, -30));
    const since90 = dayStart(addDays(today, -90));

    const [deals, projectDue, dealDue] = await Promise.all([
      this.prisma.deal.findMany({
        where: { workspaceId: workspace.id, OR: [{ closedAt: null }, { stage: 'WON' }, { closedAt: { gte: since90 } }] },
        include: {
          owner: { select: { id: true, name: true, avatarUrl: true } },
          project: { select: { id: true, key: true, name: true } },
          payments: { include: { createdBy: { select: { name: true } } } },
        },
      }),
      this.prisma.projectDueChange.findMany({
        where: { project: { workspaceId: workspace.id }, createdAt: { gte: since30 }, from: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { project: { select: { id: true, key: true, name: true } }, author: { select: { name: true } } },
      }),
      this.prisma.dealActivity.findMany({
        where: { kind: 'due', from: { not: null }, createdAt: { gte: since30 }, deal: { workspaceId: workspace.id } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { deal: { select: { number: true, title: true } }, author: { select: { name: true } } },
      }),
    ]);

    const active = deals.filter((d) => (ACTIVE_STAGES as readonly string[]).includes(d.stage));
    const payments = deals.flatMap((d) => d.payments.map((p) => ({ ...p, deal: d })));
    const won = deals.filter((d) => d.stage === 'WON');

    const debtors = won
      .map((d) => ({ d, m: dealMoney(d) }))
      .filter(({ m }) => m.remaining && m.remaining.gt(0))
      .sort((a, b) => b.m.remaining!.comparedTo(a.m.remaining!))
      .map(({ d, m }) => ({ number: d.number, title: d.title, clientName: d.clientName, currency: d.currency, remaining: m.remaining!.toString(), project: d.project }));

    const stale = active
      .filter((d) => !d.nextStepAt || d.nextStepAt.getTime() < now.getTime() - STALE_MS)
      .sort((a, b) => (a.nextStepAt?.getTime() ?? 0) - (b.nextStepAt?.getTime() ?? 0))
      .map((d) => ({ number: d.number, title: d.title, clientName: d.clientName, nextStep: d.nextStep, nextStepAt: d.nextStepAt, owner: d.owner ? { userId: d.owner.id, name: d.owner.name, avatarUrl: d.owner.avatarUrl } : null }));

    const lostReasons = new Map<string, number>();
    for (const d of deals) if (d.stage === 'LOST' && d.lostReason) lostReasons.set(d.lostReason, (lostReasons.get(d.lostReason) ?? 0) + 1);

    const byOwner = new Map<string, { userId: string; name: string; avatarUrl: string | null; active: number; amounts: { currency: string; amount: Prisma.Decimal | null }[] }>();
    for (const d of active) {
      if (!d.owner) continue;
      const row = byOwner.get(d.owner.id) ?? { userId: d.owner.id, name: d.owner.name, avatarUrl: d.owner.avatarUrl, active: 0, amounts: [] };
      row.active += 1;
      row.amounts.push({ currency: d.currency, amount: d.amount });
      byOwner.set(d.owner.id, row);
    }

    return {
      money: {
        /** Faol kelishuvlar summasi (hali yutilmagan). */
        expected: sums(active),
        /** Shu oy tasdiqlangan to'lovlar (to'lov sanasi bo'yicha). */
        receivedThisMonth: sums(payments.filter((p) => p.status === 'CONFIRMED' && p.paidAt >= monthStart)),
        /** Yutilgan kelishuvlar bo'yicha qolgan to'lovlar. */
        debt: sums(debtors.map((d) => ({ currency: d.currency, amount: new Prisma.Decimal(d.remaining) }))),
        pendingCash: payments
          .filter((p) => p.status === 'PENDING')
          .map((p) => ({ id: p.id, amount: p.amount.toString(), currency: p.currency, paidAt: day(p.paidAt), createdBy: p.createdBy.name, deal: { number: p.deal.number, title: p.deal.title } })),
      },
      pipeline: ACTIVE_STAGES.map((stage) => {
        const list = active.filter((d) => d.stage === stage);
        return { stage, count: list.length, sums: sums(list) };
      }),
      stale,
      lateSteps: active.filter((d) => d.nextStepAt && d.nextStepAt <= now && d.nextStepAt.getTime() >= now.getTime() - STALE_MS).length,
      debtors: debtors.slice(0, 10),
      month: {
        created: deals.filter((d) => d.createdAt >= monthStart).length,
        won: won.filter((d) => d.closedAt && d.closedAt >= monthStart).length,
        lost: deals.filter((d) => d.stage === 'LOST' && d.closedAt && d.closedAt >= monthStart).length,
        lostReasons: [...lostReasons].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([reason, count]) => ({ reason, count })),
      },
      owners: [...byOwner.values()].sort((a, b) => b.active - a.active).map(({ amounts, ...o }) => ({ ...o, sums: sums(amounts) })),
      dueChanges: [
        ...projectDue.map((c) => ({ kind: 'project' as const, ref: c.project.id, label: `${c.project.key} · ${c.project.name}`, from: day(c.from), to: day(c.to), reason: c.reason, author: c.author.name, at: c.createdAt })),
        ...dealDue.map((a) => ({ kind: 'deal' as const, ref: String(a.deal.number), label: `K-${a.deal.number} · ${a.deal.title}`, from: a.from, to: a.to, reason: a.body, author: a.author?.name ?? null, at: a.createdAt })),
      ]
        .sort((a, b) => b.at.getTime() - a.at.getTime())
        .slice(0, 15),
    };
  }
}
