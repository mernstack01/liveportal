import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessService } from './access.service.js';
import type { AppRequest } from './auth.types.js';
import { PROJECT_ACCESS, type ProjectAccessMeta, REQUIRE_MEMBERSHIP, REQUIRED_PERMISSION } from './decorators.js';

const DENIED = 'Bu amal uchun ruxsat yo‘q';

/**
 * Global guard (JwtAuthGuard'dan keyin). Uch xil talab:
 * - `@RequireMembership()` — workspace a'zosi bo'lish;
 * - `@RequirePermission(p)` — workspace rolida `p` ruxsati;
 * - `@RequireProjectAccess(p?)` — `:projectId` loyihasini ko'ra olish va (berilsa) workspace + loyiha rolida `p`.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: AccessService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const permission = this.reflector.getAllAndOverride<string | undefined>(REQUIRED_PERMISSION, targets);
    const membership = this.reflector.getAllAndOverride<boolean | undefined>(REQUIRE_MEMBERSHIP, targets);
    const projectAccess = this.reflector.getAllAndOverride<ProjectAccessMeta | undefined>(PROJECT_ACCESS, targets);
    if (!permission && !membership && !projectAccess) return true;

    const req = ctx.switchToHttp().getRequest<AppRequest>();
    if (!req.user) throw new ForbiddenException();

    const workspace = await this.access.workspaceFor(req.user.id);
    req.workspace = workspace;
    if (permission && !workspace.permissions.includes(permission)) throw new ForbiddenException(DENIED);

    if (projectAccess) {
      const projectId = req.params.projectId;
      if (typeof projectId !== 'string') throw new Error('@RequireProjectAccess uchun yo‘lda :projectId kerak');
      const project = await this.access.projectFor(workspace, req.user.id, projectId);
      if (projectAccess.permission && !project.permissions.includes(projectAccess.permission)) {
        throw new ForbiddenException(DENIED);
      }
      req.project = project;
    }
    return true;
  }
}
