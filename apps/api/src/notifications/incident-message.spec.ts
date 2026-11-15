import { describe, expect, it } from 'vitest';
import { formatDuration, renderIncidentMessage, type IncidentMessageInput } from './incident-message.js';

const incident: IncidentMessageInput['incident'] = {
  number: 3,
  title: 'Sayt <ochilmayapti>',
  description: 'Bosh sahifa 502 qaytaryapti',
  severity: 'SEV1',
  status: 'OPEN',
  ownerName: null,
  startedAt: new Date('2026-11-15T10:00:00.000Z'),
  resolvedAt: null,
  resolution: null,
  projectId: 'p1',
  projectKey: 'ITL',
  projectName: 'IT Live sayti',
};

describe('formatDuration', () => {
  it('daqiqa, soat, kun', () => {
    expect(formatDuration(30_000)).toBe('1 daqiqadan kam');
    expect(formatDuration(45 * 60_000)).toBe('45 daqiqa');
    expect(formatDuration(80 * 60_000)).toBe('1 soat 20 daqiqa');
    expect(formatDuration(120 * 60_000)).toBe('2 soat');
    expect(formatDuration((2 * 24 + 3) * 3_600_000)).toBe('2 kun 3 soat');
  });
});

describe('renderIncidentMessage', () => {
  it('yangi insident: daraja, HTML qochiriladi, mas’ul yo‘q, Ochish havolasi', () => {
    const msg = renderIncidentMessage({ kind: 'incident_opened', actorName: 'Ali', webOrigin: 'https://portal.itlive.uz', incident });
    expect(msg.text).toBe(
      '🚨 Yangi insident · 🔴 SEV1 · Kritik\n<b>ITL · INC-3</b> · Sayt &lt;ochilmayapti&gt;\n📁 IT Live sayti\nXabar berdi: Ali\nMas’ul: hali yo‘q — kim oladi?\n\n<blockquote>Bosh sahifa 502 qaytaryapti</blockquote>',
    );
    expect(msg.buttons).toEqual([[{ text: 'Ochish', webAppUrl: 'https://portal.itlive.uz/projects/p1/incidents/3' }]]);
  });

  it('hal qilindi: davomiylik va sabab; lokal manzilda tugma yo‘q', () => {
    const msg = renderIncidentMessage({
      kind: 'incident_status',
      actorName: 'Vali',
      webOrigin: 'http://localhost:5173',
      incident: { ...incident, status: 'RESOLVED', resolvedAt: new Date('2026-11-15T11:20:00.000Z'), resolution: 'Nginx qayta ishga tushirildi' },
      changes: { status: { from: 'MONITORING', to: 'RESOLVED' } },
    });
    expect(msg.text).toContain('✅ Insident hal qilindi');
    expect(msg.text).toContain('Vali · davomiyligi 1 soat 20 daqiqa');
    expect(msg.text).toContain('Sabab va yechim:\n\n<blockquote>Nginx qayta ishga tushirildi</blockquote>');
    expect(msg.buttons).toEqual([]);
  });

  it('holat va daraja o‘zgarishi', () => {
    const msg = renderIncidentMessage({
      kind: 'incident_status',
      actorName: 'Vali',
      webOrigin: 'http://localhost:5173',
      incident: { ...incident, status: 'MONITORING', severity: 'SEV2' },
      changes: { status: { from: 'INVESTIGATING', to: 'MONITORING' }, severity: { from: 'SEV1', to: 'SEV2' } },
    });
    expect(msg.text).toBe(
      '🛠 Insident yangilandi\n<b>ITL · INC-3</b> · Sayt &lt;ochilmayapti&gt;\nHolat: Tekshirilmoqda → <b>Kuzatuvda</b>\nDaraja: SEV1 → <b>🟠 SEV2 · Jiddiy</b>\nVali',
    );
  });
});
