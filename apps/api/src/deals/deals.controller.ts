import { Body, Controller, Get, Param, Patch, Post, Query, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { AuthUser, WorkspaceContext } from '../auth/auth.types.js';
import { CurrentUser, CurrentWorkspace, RequireMembership } from '../auth/decorators.js';
import { parse } from '../common/zod.js';
import { MAX_FILES } from '../files/uploads.js';
import { createDealSchema, dealActivitySchema, listDealsQuery, updateDealSchema } from './deal.dto.js';
import { DealsService } from './deals.service.js';

/** Kelishuvlar (savdo). Ruxsat service'da: `deal.manage` (o'zinikilar) yoki `deal.view_all` (hammasi). */
@Controller('deals')
@RequireMembership()
export class DealsController {
  constructor(private readonly deals: DealsService) {}

  @Get()
  list(@Query() query: unknown, @CurrentWorkspace() workspace: WorkspaceContext, @CurrentUser() user: AuthUser) {
    return this.deals.list(workspace, user.id, parse(listDealsQuery, query));
  }

  /** Mas'ul qilish mumkin bo'lgan xodimlar (savdo ruxsati borlar). */
  @Get('owners')
  owners(@CurrentWorkspace() workspace: WorkspaceContext) {
    return this.deals.owners(workspace);
  }

  @Post()
  create(@Body() body: unknown, @CurrentWorkspace() workspace: WorkspaceContext, @CurrentUser() user: AuthUser) {
    return this.deals.create(workspace, user.id, parse(createDealSchema, body));
  }

  /** `:ref` — raqam (K-12 uchun `12`) yoki id. Tarix bilan. */
  @Get(':ref')
  get(@Param('ref') ref: string, @CurrentWorkspace() workspace: WorkspaceContext, @CurrentUser() user: AuthUser) {
    return this.deals.get(workspace, user.id, ref);
  }

  @Patch(':ref')
  update(@Param('ref') ref: string, @Body() body: unknown, @CurrentWorkspace() workspace: WorkspaceContext, @CurrentUser() user: AuthUser) {
    return this.deals.update(workspace, user.id, ref, parse(updateDealSchema, body));
  }

  /** JSON yoki multipart (kind, body, files[]): qo'ng'iroq, uchrashuv, izoh; TZ, KP, shartnoma fayllari. */
  @Post(':ref/activities')
  @UseInterceptors(FilesInterceptor('files', MAX_FILES))
  addActivity(
    @Param('ref') ref: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Body() body: unknown,
    @CurrentWorkspace() workspace: WorkspaceContext,
    @CurrentUser() user: AuthUser,
  ) {
    const dto = parse(dealActivitySchema, body ?? {});
    return this.deals.addActivity(workspace, user.id, ref, dto.kind, dto.body, files ?? []);
  }
}
