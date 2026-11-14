import { z } from 'zod';

/** `.env` dagi bo'sh qiymat (`KEY=`) berilmagan deb hisoblanadi. */
const blankToUndefined = (value: unknown) => (value === '' ? undefined : value);

/** BotFather username'ni `@liveportal_bot` yoki `t.me/liveportal_bot` ko'rinishida beradi: ikkalasini ham qabul qilamiz. */
const normalizeBotUsername = (value: unknown) =>
  typeof value === 'string'
    ? blankToUndefined(value.trim().replace(/^(https?:\/\/)?t\.me\//i, '').replace(/^@/, ''))
    : value;

/** Maydonlar alohida: skriptlar `.pick()` bilan faqat keraklisini oladi (refine'li sxemada pick ishlamaydi). */
export const envFields = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4100),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    REDIS_URL: z.preprocess(blankToUndefined, z.url({ protocol: /^rediss?$/ }).optional()),
    WEB_ORIGIN: z.url().default('http://localhost:5173'),

    JWT_SECRET: z.string().min(32, 'JWT_SECRET kamida 32 belgi bo‘lishi kerak'),
    JWT_ACCESS_TTL_SEC: z.coerce.number().int().positive().default(900),
    REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),

    TELEGRAM_BOT_TOKEN: z.preprocess(blankToUndefined, z.string().min(1).optional()),
    /** Taklif havolasi uchun: t.me/<username>?start=inv_... Boshidagi `@` yoki `t.me/` olib tashlanadi. */
    TELEGRAM_BOT_USERNAME: z.preprocess(
      normalizeBotUsername,
      z.string().regex(/^[A-Za-z0-9_]{5,64}$/, 'bot username faqat harf, raqam va _ dan iborat bo‘lishi kerak').optional(),
    ),
    /** off — bot ishga tushmaydi (testlar), polling — lokal, webhook — production (keyin). */
    BOT_MODE: z.enum(['off', 'polling']).default('off'),
    /** Telegram ma'lumotlari qancha vaqt yaroqli (soniya). */
    TELEGRAM_AUTH_MAX_AGE_SEC: z.coerce.number().int().positive().default(86_400),

    /** Outbox eventlarini tekshirish oralig'i (ms). 0 — o'chiq (e2e testlar drain() ni o'zi chaqiradi). */
    OUTBOX_POLL_MS: z.coerce.number().int().min(0).default(2000),

    /** Faqat lokal: Telegram Login Widget localhost'da ishlamaydi. */
    DEV_LOGIN: z.stringbool().default(false),
  });

export const envSchema = envFields.refine((env) => !(env.DEV_LOGIN && env.NODE_ENV === 'production'), {
  message: 'DEV_LOGIN production’da yoqilishi mumkin emas',
  path: ['DEV_LOGIN'],
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Muhit o'zgaruvchilari noto'g'ri:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
