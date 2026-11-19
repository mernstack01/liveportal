import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../db/prisma.service.js';
import type { ProjectContext, WorkspaceContext } from './auth.types.js';

/** Xodimning workspace ruxsatlari: asosiy rol + qo'shimcha rollar (birlashmasi). */
export function memberPermissions(m: { role: { permissions: string[] }; extraRoles: { role: { permissions: string[] } }[] }): string[] {
  return [...new Set([...m.role.permissions, ...m.extraRoles.flatMap((r) => r.role.permissions)])];
}

/**
 * Kim nimaga ruxsatli ekanini hisoblaydi. Rol nomi emas, ruxsatlar to'plami qaytadi (CLAUDE.md, 3-qoida).
 * MVP'da bitta workspace: foydalanuvchining birinchi a'zoligi olinadi.
 */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  async workspaceFor(userId: string): Promise<WorkspaceContext> {
    const membership = await this.prisma.workspaceMember.findFirst({
      where: { userId },
      include: { role: true, extraRoles: { include: { role: true } } },
      orderBy: { joinedAt: 'asc' },
    });
    if (!membership) throw new ForbiddenException('Siz workspace a’zosi emassiz');
    return {
      id: membership.workspaceId,
      role: membership.role.name,
      extraRoles: membership.extraRoles.map((r) => r.role.name),
      permissions: memberPermissions(membership),
    };
  }

  /**
   * Loyihaga kirish. A'zo bo'lmagan va `dashboard.view_all` ruxsati yo'q odamga 404:
   * begona loyiha borligi ham ko'rinmaydi.
   */
  async projectFor(workspace: WorkspaceContext, userId: string, projectId: string): Promise<ProjectContext> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, workspaceId: workspace.id },
      select: { id: true, members: { where: { userId }, select: { role: true } } },
    });
    if (!project) throw new NotFoundException('Loyiha topilmadi');

    const projectRole = project.members[0]?.role;
    const permissions = [...new Set([...workspace.permissions, ...(projectRole?.permissions ?? [])])];
    if (!projectRole && !permissions.includes('dashboard.view_all')) {
      throw new NotFoundException('Loyiha topilmadi');
    }
    return { id: project.id, workspaceId: workspace.id, role: projectRole?.name ?? null, permissions };
  }
}
