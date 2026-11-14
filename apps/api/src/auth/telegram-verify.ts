import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** Telegram'dan kelgan foydalanuvchi (Login Widget va Mini App uchun umumiy). */
export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

function dataCheckString(entries: Iterable<[string, string]>): string {
  return [...entries]
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

function isFresh(authDate: number, maxAgeSec: number, nowMs: number): boolean {
  const ageSec = nowMs / 1000 - authDate;
  return Number.isFinite(authDate) && ageSec >= -60 && ageSec <= maxAgeSec;
}

/**
 * Telegram Login Widget ma'lumotini tekshiradi.
 * https://core.telegram.org/widgets/login#checking-authorization
 * Kalit: SHA256(bot_token). Kelgan barcha maydonlar (hash'dan tashqari) imzolanadi.
 */
export function verifyLoginWidget(
  data: Record<string, unknown>,
  botToken: string,
  maxAgeSec: number,
  nowMs = Date.now(),
): TelegramUser | null {
  if (typeof data.hash !== 'string') return null;
  const entries: [string, string][] = Object.entries(data)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => [key, String(value)]);

  const secret = createHash('sha256').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(dataCheckString(entries)).digest('hex');
  if (!safeEqualHex(expected, data.hash)) return null;
  if (!isFresh(Number(data.auth_date), maxAgeSec, nowMs)) return null;

  const id = Number(data.id);
  if (!Number.isSafeInteger(id) || typeof data.first_name !== 'string') return null;
  return {
    id,
    first_name: data.first_name,
    last_name: typeof data.last_name === 'string' ? data.last_name : undefined,
    username: typeof data.username === 'string' ? data.username : undefined,
    photo_url: typeof data.photo_url === 'string' ? data.photo_url : undefined,
  };
}

/**
 * Telegram Mini App `initData` satrini tekshiradi.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 * Kalit: HMAC_SHA256(key="WebAppData", bot_token).
 */
export function verifyMiniAppInitData(
  initData: string,
  botToken: string,
  maxAgeSec: number,
  nowMs = Date.now(),
): TelegramUser | null {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;

  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(dataCheckString(params.entries())).digest('hex');
  if (!safeEqualHex(expected, hash)) return null;
  if (!isFresh(Number(params.get('auth_date')), maxAgeSec, nowMs)) return null;

  try {
    const user = JSON.parse(params.get('user') ?? 'null') as Partial<TelegramUser> | null;
    if (!user || !Number.isSafeInteger(user.id) || typeof user.first_name !== 'string') return null;
    return {
      id: user.id!,
      first_name: user.first_name,
      last_name: user.last_name,
      username: user.username,
      photo_url: user.photo_url,
    };
  } catch {
    return null;
  }
}
