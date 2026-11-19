import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { WorkspaceContext } from '../auth/auth.types.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import type { Env } from '../config/env.js';
import { PrismaService } from '../db/prisma.service.js';
import { recordEvent } from '../events/outbox.js';
import { createInviteRecord, inviteLink } from '../invites/invite-record.js';
import { ProjectsRepository } from '../projects/projects.repository.js';
import type { StartProjectDto } from './deal.dto.js';
import { dealMoney, DealsService } from './deals.service.js';

/**
 * Kelishuv → loyiha. Rahbarning "ha"si (`deal.approve`) va kelishilgan foizdagi avans tushgan bo'lishi kerak.
 * Bitta tranzaksiyada: loyiha (teamlead — kelishuv mas'uli yoki tanlangan odam), kelishuv "Yutildi",
 * ixtiyoriy — mijozga taklif havolasi (qabul qilsa, loyihaga "Mijoz" bo'lib qo'shiladi).
 * Narx loyihaga ko'chirilmaydi: dasturchilar uni ko'rmaydi.
 */
@Injectable()
export class DealStartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deals: DealsService,
    private readonly projects: ProjectsRepository,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async start(workspace: WorkspaceContext, userId: string, ref: string, dto: StartProjectDto) {
    if (!workspace.permissions.includes('deal.approve')) throw new ForbiddenException('Loyihani boshlashga faqat rahbar “ha” deydi');
    const deal = await this.deals.findVisible(workspace, userId, ref);
    if (deal.stage === 'WON' || deal.projectId) throw new ConflictException('Bu kelishuv bo‘yicha loyiha allaqachon ochilgan');
    if (deal.stage === 'LOST') throw new BadRequestException('Yo‘qotilgan kelishuv — avval qayta oching');
    if (!deal.amount) throw new BadRequestException('Avval kelishuv summasini yozing');
    const money = dealMoney(deal);
    if (!money.advanceReached) {
      throw new BadRequestException(`Avans yetarli emas: kerak ${money.advanceDue?.toString()} ${deal.currency}, tasdiqlangani ${money.paid.toString()} ${deal.currency}`);
    }

    const teamleadId = dto.teamleadId ?? deal.ownerId ?? userId;
    const teamlead = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: teamleadId } },
      select: { role: { select: { name: true } } },
    });
    if (!teamlead || teamlead.role.name === 'client') throw new BadRequestException('Teamlead — workspace xodimi bo‘lishi kerak');
    const leadRole = await this.projects.findRole(this.prisma, workspace.id, 'teamlead');
    if (!leadRole) throw new Error('«teamlead» loyiha roli seed qilinmagan');

    try {
      return await this.prisma.$transaction(async (tx) => {
        const project = await this.projects.create(tx, {
          workspaceId: workspace.id,
          creatorId: teamleadId,
          creatorRoleId: leadRole.id,
          data: {
            key: dto.key,
            name: (dto.name || deal.title).slice(0, 120),
            description: deal.description,
            startDate: new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`),
            dueDate: deal.dueDate,
          },
        });
        await recordEvent(tx, { workspaceId: workspace.id, type: 'project.created', actorId: userId, entityType: 'project', entityId: project.id, payload: { key: project.key, name: project.name, dealId: deal.id } });
        if (teamleadId !== userId) {
          await recordEvent(tx, { workspaceId: workspace.id, type: 'project.member_added', actorId: userId, entityType: 'project', entityId: project.id, payload: { userId: teamleadId, role: 'teamlead' } });
        }

        const now = new Date();
        await tx.deal.update({ where: { id: deal.id }, data: { stage: 'WON', stageChangedAt: now, closedAt: now, projectId: project.id } });
        await tx.dealActivity.create({ data: { dealId: deal.id, authorId: userId, kind: 'won', from: deal.stage, to: project.key } });
        await recordEvent(tx, {
          workspaceId: workspace.id,
          type: 'deal.updated',
          actorId: userId,
          entityType: 'deal',
          entityId: deal.id,
          payload: { number: deal.number, ownerId: deal.ownerId, changes: { stage: { from: deal.stage, to: 'WON' } }, reason: null },
        });

        let link: string | null = null;
        if (dto.inviteClient) {
          const invite = await createInviteRecord(tx, { workspaceId: workspace.id, roleName: 'client', note: `${deal.clientName} — ${project.key}`, createdById: userId, projectId: project.id });
          link = inviteLink(this.config.get('TELEGRAM_BOT_USERNAME', { infer: true }), invite.token);
        }
        return { project: { id: project.id, key: project.key, name: project.name }, clientInviteLink: link };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(`«${dto.key}» kaliti band, boshqasini tanlang`);
      throw error;
    }
  }
}
