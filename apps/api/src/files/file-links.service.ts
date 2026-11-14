import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';

const TTL_SECONDS = 3600;

/**
 * Fayl havolalari imzolangan va 1 soat amal qiladi: `<img src>` token yubora olmaydi, shuning uchun
 * ruxsat havolaning o'zida. Havolani faqat chatni ko'ra oladigan odam oladi (ro'yxat API'si orqali).
 */
@Injectable()
export class FileLinksService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  private sign(id: string, exp: number): string {
    return createHmac('sha256', this.config.get('JWT_SECRET', { infer: true })).update(`file:${id}:${exp}`).digest('base64url');
  }

  url(id: string, now = Date.now()): string {
    const exp = Math.floor(now / 1000) + TTL_SECONDS;
    return `/api/v1/files/${id}?exp=${exp}&sig=${this.sign(id, exp)}`;
  }

  verify(id: string, exp: number, sig: string, now = Date.now()): boolean {
    if (!Number.isFinite(exp) || exp * 1000 < now) return false;
    const expected = Buffer.from(this.sign(id, exp));
    const given = Buffer.from(sig);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }
}
