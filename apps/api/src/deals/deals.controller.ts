import { Body, Controller, Get, Param, Patch, Post, Query, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { AuthUser, WorkspaceContext } from '../auth/auth.types.js';
import { CurrentUser, CurrentWorkspace, RequireMembership } from '../auth/decorators.js';
import { parse } from '../common/zod.js';
import { MAX_FILES } from '../files/uploads.js';
import { createDealSchema, createPaymentSchema, dealActivitySchema, listDealsQuery, rejectPaymentSchema, startProjectSchema, updateDealSchema } from './deal.dto.js';
import { DealPaymentsService } from './deal-payments.service.js';
import { DealStartService } from './deal-start.service.js';
import { DealsService } from './deals.service.js';

/** Kelishuvlar (savdo). Ruxsat service'da: `deal.manage` (o'zinikilar) yoki `deal.view_all` (hammasi). */
@Controller('deals')
@RequireMembership()
export class DealsController {
  constructor(
    private readonly deals: DealsService,
    private readonly payments: DealPaymentsService,
    private readonly starter: DealStartService,
  ) {}

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

  /** Naqd to'lovni tasdiqlash / rad etish — rahbar (`payment.confirm`). */
  @Post('payments/:paymentId/confirm')
  confirmPayment(@Param('paymentId') paymentId: string, @CurrentWorkspace() workspace: WorkspaceContext, @CurrentUser() user: AuthUser) {
    return this.payments.confirm(workspace, user.id, paymentId);
  }

  @Post('payments/:paymentId/reject')
  rejectPayment(@Param('paymentId') paymentId: string, @Body() body: unknown, @CurrentWorkspace() workspace: WorkspaceContext, @CurrentUser() user: AuthUser) {
    return this.payments.reject(workspace, user.id, paymentId, parse(rejectPaymentSchema, body).reason);
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

  @Get(':ref/payments')
  listPayments(@Param('ref') ref: string, @CurrentWorkspace() workspace: WorkspaceContext, @CurrentUser() user: AuthUser) {
    return this.payments.list(workspace, user.id, ref);
  }

  /** Multipart: amount, method (CASH | CARD), kind, paidAt, note, files[] — chek. Plastikda chek majburiy. */
  @Post(':ref/payments')
  @UseInterceptors(FilesInterceptor('files', MAX_FILES))
  addPayment(
    @Param('ref') ref: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Body() body: unknown,
    @CurrentWorkspace() workspace: WorkspaceContext,
    @CurrentUser() user: AuthUser,
  ) {
    return this.payments.create(workspace, user.id, ref, parse(createPaymentSchema, body ?? {}), files ?? []);
  }

  /** Rahbarning "ha"si: kelishuv → loyiha (avans yetarli bo'lsa). */
  @Post(':ref/start')
  start(@Param('ref') ref: string, @Body() body: unknown, @CurrentWorkspace() workspace: WorkspaceContext, @CurrentUser() user: AuthUser) {
    return this.starter.start(workspace, user.id, ref, parse(startProjectSchema, body ?? {}));
  }
}
