import { describe, expect, it } from 'vitest';
import { extractInviteToken } from './invite-record.js';

const token = 'TestToken_abcdefghijklmnopqrstuvwxyz-0123456';

describe('extractInviteToken', () => {
  it.each([
    [`inv_${token}`],
    [`/start inv_${token}`],
    [`https://t.me/liveportal_bot?start=inv_${token}`],
    [`  t.me/liveportal_bot?start=inv_${token}  `],
    [`Mana havola: https://t.me/liveportal_bot?start=inv_${token}`],
  ])('%s', (text) => {
    expect(extractInviteToken(text)).toBe(token);
  });

  it.each([[''], ['/start'], ['salom'], ['inv_qisqa'], [`xinv_${token}`]])('topmaydi: %j', (text) => {
    expect(extractInviteToken(text)).toBeUndefined();
  });
});
