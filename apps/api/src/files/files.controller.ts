import { createReadStream, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Controller, ForbiddenException, Get, NotFoundException, Param, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { Public } from '../auth/decorators.js';
import type { Env } from '../config/env.js';
import { PrismaService } from '../db/prisma.service.js';
import { dispositionName } from './file-sniff.js';
import { FileLinksService } from './file-links.service.js';

@Controller('files')
export class FilesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly links: FileLinksService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Imzolangan havola bilan (token shart emas). Rasm — brauzerda, qolgani — faqat yuklab olish. */
  @Public()
  @Get(':id')
  async get(@Param('id') id: string, @Query('exp') exp: string, @Query('sig') sig: string, @Res() res: Response) {
    if (!sig || !this.links.verify(id, Number(exp), sig)) throw new ForbiddenException('Havola eskirgan yoki noto‘g‘ri');
    const file = await this.prisma.attachment.findUnique({ where: { id } });
    const path = file && join(resolve(this.config.get('UPLOAD_DIR', { infer: true })), file.storageKey);
    if (!file || !path || !existsSync(path)) throw new NotFoundException('Fayl topilmadi');

    const image = file.kind === 'image';
    res.setHeader('Content-Type', image ? file.mimeType : 'application/octet-stream');
    res.setHeader('Content-Disposition', `${image ? 'inline' : 'attachment'}; ${dispositionName(file.fileName)}`);
    res.setHeader('Content-Length', String(file.size));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    res.setHeader('Cache-Control', 'private, max-age=3600');
    createReadStream(path).pipe(res);
  }
}
