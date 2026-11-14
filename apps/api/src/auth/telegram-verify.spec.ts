import { createHash, createHmac } from 'node:crypto';
import { verifyLoginWidget, verifyMiniAppInitData } from './telegram-verify.js';

const BOT_TOKEN = '123456:TEST_TOKEN';
const NOW = 1_800_000_000_000;
const authDate = NOW / 1000 - 60;

function signWidget(data: Record<string, string | number>) {
  const dcs = Object.keys(data)
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join('\n');
  const secret = createHash('sha256').update(BOT_TOKEN).digest();
  return { ...data, hash: createHmac('sha256', secret).update(dcs).digest('hex') };
}

function signInitData(fields: Record<string, string>) {
  const dcs = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = createHmac('sha256', secret).update(dcs).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

describe('verifyLoginWidget', () => {
  const data = signWidget({ id: 42, first_name: 'Aziz', username: 'aziz', auth_date: authDate });

  it('accepts correctly signed data', () => {
    expect(verifyLoginWidget(data, BOT_TOKEN, 86_400, NOW)).toEqual({
      id: 42,
      first_name: 'Aziz',
      last_name: undefined,
      username: 'aziz',
      photo_url: undefined,
    });
  });

  it('rejects tampered fields', () => {
    expect(verifyLoginWidget({ ...data, id: 43 }, BOT_TOKEN, 86_400, NOW)).toBeNull();
  });

  it('rejects another bot token', () => {
    expect(verifyLoginWidget(data, '999:OTHER', 86_400, NOW)).toBeNull();
  });

  it('rejects stale auth_date', () => {
    expect(verifyLoginWidget(data, BOT_TOKEN, 30, NOW)).toBeNull();
  });

  it('rejects missing or malformed hash', () => {
    expect(verifyLoginWidget({ ...data, hash: undefined }, BOT_TOKEN, 86_400, NOW)).toBeNull();
    expect(verifyLoginWidget({ ...data, hash: 'zz' }, BOT_TOKEN, 86_400, NOW)).toBeNull();
  });
});

describe('verifyMiniAppInitData', () => {
  const user = JSON.stringify({ id: 7, first_name: 'Malika', username: 'malika' });
  const initData = signInitData({ auth_date: String(authDate), query_id: 'AAA', user });

  it('accepts correctly signed initData', () => {
    expect(verifyMiniAppInitData(initData, BOT_TOKEN, 86_400, NOW)).toMatchObject({ id: 7, first_name: 'Malika' });
  });

  it('rejects modified user', () => {
    const forged = initData.replace('Malika', 'Hacker');
    expect(verifyMiniAppInitData(forged, BOT_TOKEN, 86_400, NOW)).toBeNull();
  });

  it('rejects widget-style signature (different key derivation)', () => {
    const params = new URLSearchParams(initData);
    const widget = signWidget({ auth_date: authDate, query_id: 'AAA', user });
    params.set('hash', widget.hash);
    expect(verifyMiniAppInitData(params.toString(), BOT_TOKEN, 86_400, NOW)).toBeNull();
  });

  it('rejects stale auth_date', () => {
    expect(verifyMiniAppInitData(initData, BOT_TOKEN, 30, NOW)).toBeNull();
  });
});
