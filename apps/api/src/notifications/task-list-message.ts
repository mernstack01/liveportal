import { dueBucket, type DueBucket } from '../tasks/due.js';
import type { OpenTask } from '../tasks/open-tasks.js';
import { escapeHtml, type RenderedMessage } from './notification-message.js';

const SECTIONS: { bucket: DueBucket; title: string }[] = [
  { bucket: 'overdue', title: '🔴 Muddati o‘tgan' },
  { bucket: 'today', title: '🟠 Bugun' },
  { bucket: 'tomorrow', title: '🟡 Ertaga' },
  { bucket: 'week', title: '🔵 Shu hafta' },
  { bucket: 'later', title: '⚪ Keyinroq' },
  { bucket: 'none', title: '⚪ Muddatsiz' },
];
const PER_SECTION = 10;

function shortDay(date: Date): string {
  const [, m, d] = date.toISOString().slice(0, 10).split('-');
  return `${d}.${m}`;
}

function myTasksButton(webOrigin: string) {
  return webOrigin.startsWith('https://') ? [[{ text: 'Mening tasklarim', webAppUrl: `${webOrigin.replace(/\/$/, '')}/my` }]] : [];
}

function sections(tasks: OpenTask[], today: string, buckets: DueBucket[], now: Date): string[] {
  const out: string[] = [];
  for (const { bucket, title } of SECTIONS.filter((s) => buckets.includes(s.bucket))) {
    const list = tasks.filter((t) => dueBucket(t.dueDate, today, t.dueTime, now) === bucket);
    if (list.length === 0) continue;
    const lines = list.slice(0, PER_SECTION).map((t) => {
      const sameDay = bucket === 'today' || bucket === 'tomorrow';
      const when = t.dueDate ? [sameDay ? '' : shortDay(t.dueDate), t.dueTime ?? ''].filter(Boolean).join(' ') : '';
      const due = when ? ` — ${when}` : '';
      return `• <b>${escapeHtml(t.key)}</b> ${escapeHtml(t.title)}${due}`;
    });
    if (list.length > PER_SECTION) lines.push(`  … va yana ${list.length - PER_SECTION} ta`);
    out.push(`${title} (${list.length})\n${lines.join('\n')}`);
  }
  return out;
}

const URGENT: DueBucket[] = ['overdue', 'today', 'tomorrow'];

/**
 * Ertalabki xulosa va `/today`: muddati o'tgan, bugun va ertaga tugaydigan tasklar.
 * Bo'sh bo'lsa null (ertalab bo'sh xabar yuborilmaydi).
 */
export function renderDigest(tasks: OpenTask[], today: string, webOrigin: string, morning: boolean, now = new Date()): RenderedMessage | null {
  const body = sections(tasks, today, URGENT, now);
  if (body.length === 0) return null;
  const head = morning ? '☀️ <b>Xayrli tong!</b> Bugun e’tibor kerak bo‘lgan tasklaringiz:' : '📋 <b>Bugungi tasklaringiz</b>';
  const rest = tasks.filter((t) => !URGENT.includes(dueBucket(t.dueDate, today, t.dueTime, now))).length;
  const tail = rest > 0 ? `\n\nYana ${rest} ta ochiq task: /mytasks` : '';
  return { text: `${head}\n\n${body.join('\n\n')}${tail}`, buttons: myTasksButton(webOrigin) };
}

/** `/mytasks`: barcha ochiq tasklar muddat bo'yicha. */
export function renderTaskList(tasks: OpenTask[], today: string, webOrigin: string, now = new Date()): RenderedMessage {
  if (tasks.length === 0) return { text: 'Sizda ochiq task yo‘q 🎉', buttons: [] };
  const body = sections(tasks, today, SECTIONS.map((s) => s.bucket), now);
  return { text: `📋 <b>Mening tasklarim</b> (${tasks.length})\n\n${body.join('\n\n')}`, buttons: myTasksButton(webOrigin) };
}
