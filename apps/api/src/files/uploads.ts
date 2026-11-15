import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { open, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import type { MulterModuleOptions } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import type { Env } from '../config/env.js';
import type { Attachment } from '../generated/prisma/client.js';
import { sniffImage } from './file-sniff.js';
import type { FileLinksService } from './file-links.service.js';

/** Bitta xabar yoki yangilanishga ko'pi bilan shuncha fayl. */
export const MAX_FILES = 10;

/**
 * Multer sozlamasi (chat va insidentlar bir xil): fayl to'g'ridan-to'g'ri diskka, tasodifiy nom bilan;
 * asl nom faqat bazada. Hajm `MAX_UPLOAD_MB` bilan cheklangan.
 */
export function uploadOptions(config: ConfigService<Env, true>): MulterModuleOptions {
  const dir = resolve(config.get('UPLOAD_DIR', { infer: true }));
  mkdirSync(dir, { recursive: true });
  return {
    storage: diskStorage({ destination: dir, filename: (_req, _file, cb) => cb(null, randomBytes(16).toString('hex')) }),
    limits: { fileSize: config.get('MAX_UPLOAD_MB', { infer: true }) * 1024 * 1024, files: MAX_FILES },
    // O'zbekcha/ruscha fayl nomlari buzilmasligi uchun.
    defParamCharset: 'utf8',
  };
}

/** Birinchi baytlar: rasmmi yoki oddiy fayl. */
async function head(path: string): Promise<Buffer> {
  const fd = await open(path, 'r');
  try {
    const { buffer, bytesRead } = await fd.read(Buffer.alloc(16), 0, 16, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await fd.close();
  }
}

/**
 * Diskka tushgan fayllardan Attachment qatorlari. Rasm turi baytlardan aniqlanadi
 * (nomi yoki brauzer aytgan tur emas): "surat.png" deb nomlangan HTML rasm sifatida berilmaydi.
 */
export function attachmentRows(files: Express.Multer.File[], owner: { workspaceId: string; projectId: string; uploaderId: string }) {
  return Promise.all(
    files.map(async (f) => {
      const image = sniffImage(await head(f.path));
      return {
        ...owner,
        fileName: f.originalname.slice(0, 200) || 'fayl',
        mimeType: image ?? (f.mimetype || 'application/octet-stream').slice(0, 100),
        kind: image ? 'image' : 'file',
        size: f.size,
        storageKey: f.filename,
      };
    }),
  );
}

/** Xato bo'lsa, diskka tushgan fayllar o'chiriladi (bazada yozuvi yo'q fayl qolmasin). */
export function discardUploads(files: Express.Multer.File[]) {
  return Promise.all(files.map((f) => rm(f.path, { force: true })));
}

/** API javobidagi ko'rinish: imzolangan, 1 soatlik havola bilan. */
export function toAttachment(a: Attachment, links: FileLinksService) {
  return { id: a.id, fileName: a.fileName, kind: a.kind, mimeType: a.mimeType, size: a.size, url: links.url(a.id) };
}
