import { describe, expect, it } from 'vitest';
import { envSchema } from './env.js';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5434/db',
  JWT_SECRET: 'x'.repeat(32),
};

describe('envSchema TELEGRAM_BOT_USERNAME', () => {
  it.each([
    ['liveportal_bot', 'liveportal_bot'],
    ['@liveportal_bot', 'liveportal_bot'],
    [' @liveportal_bot ', 'liveportal_bot'],
    ['https://t.me/liveportal_bot', 'liveportal_bot'],
    ['t.me/liveportal_bot', 'liveportal_bot'],
  ])('%j → %j', (input, expected) => {
    expect(envSchema.parse({ ...base, TELEGRAM_BOT_USERNAME: input }).TELEGRAM_BOT_USERNAME).toBe(expected);
  });

  it('bo‘sh qiymat berilmagan deb hisoblanadi', () => {
    expect(envSchema.parse({ ...base, TELEGRAM_BOT_USERNAME: '' }).TELEGRAM_BOT_USERNAME).toBeUndefined();
  });

  it('noto‘g‘ri belgilarni rad etadi', () => {
    expect(() => envSchema.parse({ ...base, TELEGRAM_BOT_USERNAME: 'live portal' })).toThrow();
  });
});
