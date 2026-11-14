import { createHash, randomBytes } from 'node:crypto';

/** URL'ga xavfsiz tasodifiy token (256 bit). */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Tokenlar bazada faqat xesh ko'rinishida saqlanadi. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
