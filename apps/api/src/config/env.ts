import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4100),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }).optional(),
  WEB_ORIGIN: z.url().default('http://localhost:5173'),
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Muhit o'zgaruvchilari noto'g'ri:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
