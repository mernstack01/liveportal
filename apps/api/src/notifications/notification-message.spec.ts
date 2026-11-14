import { describe, expect, it } from 'vitest';
import { escapeHtml, renderMessage, type MessageTask } from './notification-message.js';

const task: MessageTask = {
  id: 'task1',
  key: 'LP-12',
  number: 12,
  title: 'Login <sahifa> & dizayn',
  projectId: 'p1',
  projectName: 'LivePortal',
  dueDate: new Date('2026-11-20T00:00:00.000Z'),
  priority: 'URGENT',
  statusName: 'To do',
  statusCategory: 'TODO',
  assigneeId: 'u-mentor',
  assigneeName: 'Vali',
};

describe('renderMessage', () => {
  it('tayinlash: muddat, prioritet, HTML qochiriladi, bajaruvchiga tugmalar', () => {
    const msg = renderMessage({ kind: 'assigned', recipientId: 'u-mentor', actorName: 'Ali', webOrigin: 'https://portal.itlive.uz', task });
    expect(msg.text).toContain('📌 Ali sizga task berdi');
    expect(msg.text).toContain('<b>LP-12</b> · Login &lt;sahifa&gt; &amp; dizayn');
    expect(msg.text).toContain('⏰ Muddat: 20.11.2026');
    expect(msg.text).toContain('🔥 Shoshilinch');
    expect(msg.buttons).toEqual([
      [
        { text: '▶️ Boshladim', callbackData: 'ts:task1:start' },
        { text: '👀 Review’ga', callbackData: 'ts:task1:review' },
      ],
      [{ text: 'Ochish', webAppUrl: 'https://portal.itlive.uz/projects/p1/tasks/12' }],
    ]);
  });

  it('bajaruvchi bo‘lmagan odamga holat tugmalari yo‘q; lokal manzilda Ochish yo‘q', () => {
    const msg = renderMessage({ kind: 'review', recipientId: 'u-lead', actorName: 'Vali', webOrigin: 'http://localhost:5173', task });
    expect(msg.text).toContain('Review’ga o‘tdi');
    expect(msg.text).toContain('Bajaruvchi: Vali');
    expect(msg.buttons).toEqual([]);
  });

  it('jarayondagi taskda faqat Review’ga; izoh qisqartiriladi va iqtibos qilinadi', () => {
    const msg = renderMessage({
      kind: 'commented',
      recipientId: 'u-mentor',
      actorName: 'Ali',
      webOrigin: 'http://localhost:5173',
      task: { ...task, statusCategory: 'IN_PROGRESS' },
      commentBody: 'a'.repeat(400),
    });
    expect(msg.text).toMatch(/<blockquote>a{299}…<\/blockquote>$/);
    expect(msg.buttons).toEqual([[{ text: '👀 Review’ga', callbackData: 'ts:task1:review' }]]);
  });

  it('loyihaga qo‘shildi: rol nomi o‘zbekcha', () => {
    const msg = renderMessage({
      kind: 'added',
      recipientId: 'u1',
      actorName: 'Ali',
      webOrigin: 'https://portal.itlive.uz',
      project: { id: 'p1', name: 'LivePortal' },
      role: 'mentor',
    });
    expect(msg.text).toBe('👋 Ali sizni <b>LivePortal</b> loyihasiga qo‘shdi.\nRolingiz: Mentor');
    expect(msg.buttons).toEqual([[{ text: 'Ochish', webAppUrl: 'https://portal.itlive.uz/projects/p1' }]]);
  });

  it('escapeHtml', () => {
    expect(escapeHtml('<b>&')).toBe('&lt;b&gt;&amp;');
  });
});
