import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { ProjectContext } from '../auth/auth.types.js';
import { PrismaService } from '../db/prisma.service.js';
import { recordEvent } from '../events/outbox.js';
import type { IncidentStatus, Prisma } from '../generated/prisma/client.js';
import type { CreateIncidentDto, UpdateIncidentDto } from './incident.dto.js';

const person = {
  select: { id: true, name: true, telegramUsername: true, avatarUrl: true },
} as const;
const incidentInclude = {
  reporter: person,
  owner: person,
} satisfies Prisma.IncidentInclude;
type IncidentRow = Prisma.IncidentGetPayload<{
  include: typeof incidentInclude;
}>;
type PersonRow = IncidentRow['reporter'] | null;

function toPerson(u: PersonRow) {
  return u
    ? {
        userId: u.id,
        name: u.name,
        telegramUsername: u.telegramUsername,
        avatarUrl: u.avatarUrl,
      }
    : null;
}

export function toIncident(i: IncidentRow) {
  return {
    id: i.id,
    number: i.number,
    key: `INC-${i.number}`,
    projectId: i.projectId,
    title: i.title,
    description: i.description,
    severity: i.severity,
    status: i.status,
    reporter: toPerson(i.reporter),
    owner: toPerson(i.owner),
    startedAt: i.startedAt,
    resolvedAt: i.resolvedAt,
    resolution: i.resolution,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
  };
}

/** Xronologiyadagi avtomatik yozuvlar shu maydonlar o'zgarganda qo'shiladi. */
type Change = {
  kind: 'status' | 'severity' | 'owner';
  from: string | null;
  to: string | null;
};

/**
 * Insidentlar: loyihadagi "hozir yonayotgan" muammolar. Task'dan farqi — daraja (SEV1–4),
 * holat (Ochiq → Tekshirilmoqda → Kuzatuvda → Hal qilindi), mas'ul va xronologiya.
 */
@Injectable()
export class IncidentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Ochiqlari oldin: eng og'ir daraja, keyin eng yangisi. */
  async list(project: ProjectContext, status: 'open' | 'resolved' | 'all') {
    const where: Prisma.IncidentWhereInput = { projectId: project.id };
    if (status === 'open') where.status = { not: 'RESOLVED' };
    if (status === 'resolved') where.status = 'RESOLVED';
    const rows = await this.prisma.incident.findMany({
      where,
      include: incidentInclude,
      orderBy: [{ createdAt: 'desc' }],
      take: 200,
    });
    const open = rows.filter((r) => r.status !== 'RESOLVED').sort((a, b) => a.severity.localeCompare(b.severity));
    const resolved = rows.filter((r) => r.status === 'RESOLVED');
    return [...open, ...resolved].map(toIncident);
  }

  /** `ref` — insident raqami (INC-3 uchun `3`) yoki id. Xronologiya bilan. */
  async get(project: ProjectContext, ref: string) {
    const incident = await this.find(project, ref);
    const [updates, tasks, { key: projectKey }] = await Promise.all([
      this.prisma.incidentUpdate.findMany({ where: { incidentId: incident.id }, orderBy: { createdAt: 'asc' }, include: { author: person } }),
      this.prisma.task.findMany({
        where: { incidentId: incident.id },
        orderBy: { number: 'asc' },
        select: {
          id: true,
          number: true,
          title: true,
          status: { select: { name: true, category: true, color: true } },
          assignees: { orderBy: { createdAt: 'asc' }, select: { user: person } },
        },
      }),
      this.prisma.project.findUniqueOrThrow({ where: { id: project.id }, select: { key: true } }),
    ]);
    return {
      ...toIncident(incident),
      /** Insidentdan kelib chiqqan tasklar (tuzatish, keyingi qadamlar). */
      tasks: tasks.map((t) => ({
        id: t.id,
        number: t.number,
        key: `${projectKey}-${t.number}`,
        title: t.title,
        status: t.status,
        assignees: t.assignees.map((a) => toPerson(a.user)!),
      })),
      updates: updates.map((u) => ({
        id: u.id,
        kind: u.kind,
        body: u.body,
        from: u.from,
        to: u.to,
        author: toPerson(u.author),
        createdAt: u.createdAt,
      })),
    };
  }

  async create(project: ProjectContext, actorId: string, dto: CreateIncidentDto) {
    await this.assertWritable(project);
    if (dto.ownerId) await this.assertResponder(project, dto.ownerId);

    const created = await this.prisma.$transaction(async (tx) => {
      const { incidentCounter } = await tx.project.update({
        where: { id: project.id },
        data: { incidentCounter: { increment: 1 } },
        select: { incidentCounter: true },
      });
      const incident = await tx.incident.create({
        data: {
          projectId: project.id,
          number: incidentCounter,
          title: dto.title,
          description: dto.description || null,
          severity: dto.severity,
          // Mas'ul darhol tayinlansa, demak kimdir allaqachon ko'ryapti.
          status: dto.ownerId ? 'INVESTIGATING' : 'OPEN',
          reporterId: actorId,
          ownerId: dto.ownerId ?? null,
          startedAt: dto.startedAt ?? new Date(),
          updates: {
            create: { authorId: actorId, kind: 'created', to: dto.severity },
          },
        },
        include: incidentInclude,
      });
      await recordEvent(tx, {
        workspaceId: project.workspaceId,
        type: 'incident.created',
        actorId,
        entityType: 'incident',
        entityId: incident.id,
        payload: {
          projectId: project.id,
          number: incident.number,
          severity: incident.severity,
          ownerId: incident.ownerId,
          reporterId: actorId,
        },
      });
      return incident;
    });
    return toIncident(created);
  }

  async update(project: ProjectContext, actorId: string, ref: string, dto: UpdateIncidentDto) {
    await this.assertWritable(project);
    const current = await this.find(project, ref);
    if (dto.ownerId && dto.ownerId !== current.ownerId) await this.assertResponder(project, dto.ownerId);

    const changes: Change[] = [];
    if (dto.status && dto.status !== current.status) changes.push({ kind: 'status', from: current.status, to: dto.status });
    if (dto.severity && dto.severity !== current.severity)
      changes.push({
        kind: 'severity',
        from: current.severity,
        to: dto.severity,
      });
    if (dto.ownerId !== undefined && dto.ownerId !== current.ownerId) changes.push({ kind: 'owner', from: current.ownerId, to: dto.ownerId });

    const data: Prisma.IncidentUncheckedUpdateInput = {
      title: dto.title,
      description: dto.description,
      severity: dto.severity,
      status: dto.status,
      ownerId: dto.ownerId,
      resolution: dto.resolution,
      startedAt: dto.startedAt,
    };
    if (dto.status && dto.status !== current.status) {
      // Hal qilindi — vaqt yoziladi; qayta ochilsa — o'chiriladi.
      data.resolvedAt = dto.status === 'RESOLVED' ? new Date() : null;
    } else if (!dto.status && current.status === 'OPEN' && dto.ownerId) {
      // "Ochiq" insidentga mas'ul tayinlandi: demak endi tekshirilmoqda.
      data.status = 'INVESTIGATING';
      changes.push({ kind: 'status', from: 'OPEN', to: 'INVESTIGATING' });
    }
    const startedAt = dto.startedAt ?? current.startedAt;
    if (current.resolvedAt && startedAt > current.resolvedAt && data.resolvedAt !== null) {
      throw new BadRequestException('Boshlanish vaqti hal qilingan vaqtdan keyin bo‘lmaydi');
    }

    const saved = await this.prisma.$transaction(async (tx) => {
      const incident = await tx.incident.update({
        where: { id: current.id },
        data,
        include: incidentInclude,
      });
      if (changes.length > 0) {
        await tx.incidentUpdate.createMany({
          data: changes.map((c) => ({
            incidentId: current.id,
            authorId: actorId,
            kind: c.kind,
            from: c.from,
            to: c.to,
          })),
        });
        await recordEvent(tx, {
          workspaceId: project.workspaceId,
          type: 'incident.updated',
          actorId,
          entityType: 'incident',
          entityId: current.id,
          payload: {
            projectId: project.id,
            number: incident.number,
            changes: Object.fromEntries(changes.map((c) => [c.kind, { from: c.from, to: c.to }])),
            ownerId: incident.ownerId,
            reporterId: incident.reporterId,
          },
        });
      }
      return incident;
    });
    return toIncident(saved);
  }

  /** Xronologiyaga qo'lda yangilanish ("DB qayta ishga tushirildi, kuzatyapmiz"). */
  async note(project: ProjectContext, actorId: string, ref: string, body: string) {
    await this.assertWritable(project);
    const incident = await this.find(project, ref);
    const update = await this.prisma.$transaction(async (tx) => {
      const created = await tx.incidentUpdate.create({
        data: {
          incidentId: incident.id,
          authorId: actorId,
          kind: 'note',
          body,
        },
        include: { author: person },
      });
      await tx.incident.update({
        where: { id: incident.id },
        data: { updatedAt: new Date() },
      });
      await recordEvent(tx, {
        workspaceId: project.workspaceId,
        type: 'incident.noted',
        actorId,
        entityType: 'incident',
        entityId: incident.id,
        payload: {
          projectId: project.id,
          number: incident.number,
          updateId: created.id,
          ownerId: incident.ownerId,
          reporterId: incident.reporterId,
        },
      });
      return created;
    });
    return {
      id: update.id,
      kind: update.kind,
      body: update.body,
      from: null,
      to: null,
      author: toPerson(update.author),
      createdAt: update.createdAt,
    };
  }

  private async find(project: ProjectContext, ref: string) {
    const number = /^\d+$/.test(ref) ? Number(ref) : null;
    const incident = await this.prisma.incident.findFirst({
      where: {
        projectId: project.id,
        ...(number !== null ? { number } : { id: ref }),
      },
      include: incidentInclude,
    });
    if (!incident) throw new NotFoundException('Insident topilmadi');
    return incident;
  }

  /** Mas'ul — insidentlarni ko'ra oladigan loyiha a'zosi (mijoz emas). */
  private async assertResponder(project: ProjectContext, userId: string) {
    const member = await this.prisma.projectMember.findFirst({
      where: {
        projectId: project.id,
        userId,
        role: { permissions: { has: 'incident.view' } },
      },
      select: { userId: true },
    });
    if (!member) throw new BadRequestException('Mas’ul faqat loyihadagi xodim bo‘ladi');
  }

  private async assertWritable(project: ProjectContext) {
    const { status } = await this.prisma.project.findUniqueOrThrow({
      where: { id: project.id },
      select: { status: true },
    });
    if (status === 'ARCHIVED') throw new ConflictException('Loyiha arxivda');
  }
}

export const OPEN_STATUSES: IncidentStatus[] = ['OPEN', 'INVESTIGATING', 'MONITORING'];
