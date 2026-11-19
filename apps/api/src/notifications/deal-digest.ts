import type { PrismaService } from '../db/prisma.service.js';
import { ACTIVE_STAGES } from '../deals/deal.dto.js';
import { addDays, localDay, localMidnight } from '../tasks/due.js';
import { formatWhen } from './deal-message.js';
import { escapeHtml } from './notification-message.js';

const STALE_MS = 24 * 3_600_000;
const PER_SECTION = 8;

/**
 * Ertalabki xulosaning savdo qismi.
 * Savdochiga: bugungi (va vaqti o'tgan) keyingi qadamlari. Rahbarga (`deal.view_all`): tasdiq kutayotgan naqd to'lovlar,
 * qotib qolgan kelishuvlar va kecha muddati o'zgargan loyihalar soni. Aytadigan narsa bo'lmasa — bo'sh ro'yxat.
 */
export async function dealDigestLines(prisma: PrismaService, userId: string, now = new Date()): Promise<string[]> {
  const today = localDay(now);
  const endOfToday = localMidnight(addDays(today, 1));
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId },
    select: { workspaceId: true, role: { select: { permissions: true } }, extraRoles: { select: { role: { select: { permissions: true } } } } },
  });
  if (!membership) return [];
  const permissions = new Set([...membership.role.permissions, ...membership.extraRoles.flatMap((r) => r.role.permissions)]);
  const active = { workspaceId: membership.workspaceId, stage: { in: [...ACTIVE_STAGES] } };
  const out: string[] = [];

  if (permissions.has('deal.manage') || permissions.has('deal.view_all')) {
    const steps = await prisma.deal.findMany({
      where: { ...active, ownerId: userId, nextStepAt: { lt: endOfToday } },
      orderBy: { nextStepAt: 'asc' },
      select: { number: true, title: true, nextStep: true, nextStepAt: true },
    });
    if (steps.length > 0) {
      const lines = steps.slice(0, PER_SECTION).map((d) => {
        const late = d.nextStepAt! <= now ? ' ⚠️' : '';
        return `• <b>K-${d.number}</b> ${escapeHtml(d.title)} — ${escapeHtml(d.nextStep ?? '')} (${formatWhen(d.nextStepAt!).slice(-5)}${late})`;
      });
      if (steps.length > PER_SECTION) lines.push(`  … va yana ${steps.length - PER_SECTION} ta`);
      out.push(`💼 Bugungi savdo qadamlari (${steps.length})\n${lines.join('\n')}`);
    }
  }

  if (permissions.has('deal.view_all')) {
    const [cash, stale, dueChanges] = await Promise.all([
      prisma.dealPayment.count({ where: { status: 'PENDING', deal: { workspaceId: membership.workspaceId } } }),
      prisma.deal.count({ where: { ...active, OR: [{ nextStepAt: null }, { nextStepAt: { lt: new Date(now.getTime() - STALE_MS) } }] } }),
      prisma.projectDueChange.count({ where: { project: { workspaceId: membership.workspaceId }, from: { not: null }, createdAt: { gte: localMidnight(addDays(today, -1)) } } }),
    ]);
    const lines: string[] = [];
    if (cash > 0) lines.push(`💵 Tasdiq kutayotgan naqd to‘lovlar: <b>${cash}</b>`);
    if (stale > 0) lines.push(`⚠️ Qotib qolgan kelishuvlar: <b>${stale}</b>`);
    if (dueChanges > 0) lines.push(`📅 Muddati o‘zgargan loyihalar (kechadan beri): <b>${dueChanges}</b>`);
    if (lines.length > 0) out.push(`👔 Rahbar uchun\n${lines.join('\n')}`);
  }
  return out;
}

/** Savdo qismi bor odamlar (xulosa yuboriladiganlar ro'yxatiga qo'shiladi). */
export async function dealDigestRecipients(prisma: Pick<PrismaService, 'deal' | 'dealPayment' | 'workspaceMember'>, now = new Date()) {
  const today = localDay(now);
  const endOfToday = localMidnight(addDays(today, 1));
  const active = { stage: { in: [...ACTIVE_STAGES] } };
  const [owners, cashWorkspaces, staleWorkspaces] = await Promise.all([
    prisma.deal.findMany({ where: { ...active, ownerId: { not: null }, nextStepAt: { lt: endOfToday } }, select: { workspaceId: true, ownerId: true }, distinct: ['ownerId'] }),
    prisma.dealPayment.findMany({ where: { status: 'PENDING' }, select: { deal: { select: { workspaceId: true } } } }),
    prisma.deal.findMany({ where: { ...active, OR: [{ nextStepAt: null }, { nextStepAt: { lt: new Date(now.getTime() - STALE_MS) } }] }, select: { workspaceId: true }, distinct: ['workspaceId'] }),
  ]);
  const supervisedWorkspaces = new Set([...cashWorkspaces.map((p) => p.deal.workspaceId), ...staleWorkspaces.map((d) => d.workspaceId)]);
  const has = { permissions: { has: 'deal.view_all' } };
  const supervisors = supervisedWorkspaces.size
    ? await prisma.workspaceMember.findMany({
        where: { workspaceId: { in: [...supervisedWorkspaces] }, OR: [{ role: has }, { extraRoles: { some: { role: has } } }] },
        select: { workspaceId: true, userId: true },
      })
    : [];
  return [...owners.map((o) => ({ workspaceId: o.workspaceId, userId: o.ownerId! })), ...supervisors];
}
