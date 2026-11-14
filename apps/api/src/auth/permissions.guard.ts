import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../db/prisma.service.js';
import type { AppRequest } from './auth.types.js';
import { REQUIRED_PERMISSION } from './decorators.js';

/**
 * Workspace darajasidagi ruxsat. MVP'da bitta workspace (IT Live), shuning uchun
 * foydalanuvchining a'zoligi olinadi. Loyiha darajasidagi ruxsat 3-kunda qo'shiladi.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<string | undefined>(REQUIRED_PERMISSION, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!permission) return true;

    const req = ctx.switchToHttp().getRequest<AppRequest>();
    if (!req.user) throw new ForbiddenException();

    const membership = await this.prisma.workspaceMember.findFirst({
      where: { userId: req.user.id },
      include: { role: true },
      orderBy: { joinedAt: 'asc' },
    });
    if (!membership || !membership.role.permissions.includes(permission)) {
      throw new ForbiddenException('Bu amal uchun ruxsat yo‘q');
    }
    req.workspace = {
      id: membership.workspaceId,
      role: membership.role.name,
      permissions: membership.role.permissions,
    };
    return true;
  }
}
