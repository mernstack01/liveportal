import type { NotificationKind } from './notification-rules.js';

export type MessageButton = { text: string; callbackData: string } | { text: string; webAppUrl: string };

export interface RenderedMessage {
  text: string;
  buttons: MessageButton[][];
}

export interface MessageTask {
  id: string;
  key: string;
  number: number;
  title: string;
  projectId: string;
  projectName: string;
  dueDate: Date | null;
  dueTime?: string | null;
  priority: string;
  statusName: string;
  statusCategory: string;
  assigneeIds: string[];
  /** Mas'ullar ismlari vergul bilan, yo'q bo'lsa null. */
  assigneeName: string | null;
}

export interface MessageInput {
  kind: NotificationKind;
  recipientId: string;
  actorName: string | null;
  webOrigin: string;
  task?: MessageTask;
  commentBody?: string;
  project?: { id: string; name: string };
  role?: string;
  /** Chat xabari (kind 'chat_mention'). */
  chatBody?: string;
  /** Chat xabaridagi fayllar soni. */
  chatFiles?: number;
}

/** Zaxira: odatda sender rolning bazadagi nomini (title) beradi. */
const ROLE_LABELS: Record<string, string> = { teamlead: 'Teamlead', developer: 'Dasturchi', guest: 'Mehmon' };
const PRIORITY_MARK: Record<string, string> = { HIGH: '🔺 Yuqori prioritet', URGENT: '🔥 Shoshilinch' };

/** Telegram HTML rejimi uchun. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function excerpt(text: string, max = 300): string {
  const clean = text.trim().replace(/\n{3,}/g, '\n\n');
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function day(date: Date, time?: string | null): string {
  const iso = date.toISOString().slice(0, 10);
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}${time ? ` ${time}` : ''}`;
}

/** Telegram tugmasi faqat https manzilni qabul qiladi (lokalda tugma chiqmaydi). */
function openButton(webOrigin: string, path: string): MessageButton[] {
  return webOrigin.startsWith('https://') ? [{ text: 'Ochish', webAppUrl: `${webOrigin.replace(/\/$/, '')}${path}` }] : [];
}

function taskButtons(input: MessageInput, task: MessageTask): MessageButton[][] {
  const actions: MessageButton[] = [];
  // Holatni tugma bilan faqat bajaruvchining o'zi o'zgartiradi.
  if (task.assigneeIds.includes(input.recipientId)) {
    if (task.statusCategory === 'TODO') actions.push({ text: '▶️ Boshladim', callbackData: `ts:${task.id}:start` });
    if (task.statusCategory === 'TODO' || task.statusCategory === 'IN_PROGRESS') {
      actions.push({ text: '👀 Review’ga', callbackData: `ts:${task.id}:review` });
    }
  }
  const open = openButton(input.webOrigin, `/projects/${task.projectId}/tasks/${task.number}`);
  return [actions, open].filter((row) => row.length > 0);
}

export function renderMessage(input: MessageInput): RenderedMessage {
  const actor = escapeHtml(input.actorName ?? 'Kimdir');
  const task = input.task;
  const head = task ? `<b>${escapeHtml(task.key)}</b> · ${escapeHtml(task.title)}` : '';
  const quote = input.commentBody ? `\n\n<blockquote>${escapeHtml(excerpt(input.commentBody))}</blockquote>` : '';

  if (input.kind === 'chat_mention' && input.project) {
    return {
      text:
        `💬 ${actor} sizni <b>${escapeHtml(input.project.name)}</b> chatida belgiladi` +
        (input.chatBody ? `\n\n<blockquote>${escapeHtml(excerpt(input.chatBody))}</blockquote>` : '') +
        (input.chatFiles ? `\n📎 ${input.chatFiles} ta fayl` : ''),
      buttons: [openButton(input.webOrigin, `/projects/${input.project.id}/chat`)].filter((r) => r.length > 0),
    };
  }

  if (input.kind === 'added' && input.project) {
    const role = input.role ? `\nRolingiz: ${ROLE_LABELS[input.role] ?? escapeHtml(input.role)}` : '';
    return {
      text: `👋 ${actor} sizni <b>${escapeHtml(input.project.name)}</b> loyihasiga qo‘shdi.${role}`,
      buttons: [openButton(input.webOrigin, `/projects/${input.project.id}`)].filter((r) => r.length > 0),
    };
  }
  if (!task) return { text: `${actor}: yangilik bor.`, buttons: [] };

  const lines: string[] = [];
  switch (input.kind) {
    case 'assigned':
      lines.push(`📌 ${actor} sizga task berdi`, head, `📁 ${escapeHtml(task.projectName)}`);
      if (task.dueDate) lines.push(`⏰ Muddat: ${day(task.dueDate, task.dueTime)}`);
      if (PRIORITY_MARK[task.priority]) lines.push(PRIORITY_MARK[task.priority]);
      break;
    case 'claimed':
      lines.push(`🙋 ${actor} taskni oldi`, head, `📁 ${escapeHtml(task.projectName)}`);
      break;
    case 'mentioned':
      lines.push(`💬 ${actor} sizni izohda belgiladi`, head);
      break;
    case 'commented':
      lines.push(`💬 ${actor} izoh yozdi`, head);
      break;
    case 'review':
      lines.push(`👀 Review’ga o‘tdi`, head, `👤 Bajaruvchi: ${escapeHtml(task.assigneeName ?? '—')}`, `📁 ${escapeHtml(task.projectName)}`);
      break;
    case 'overdue':
      if (task.assigneeIds.includes(input.recipientId)) lines.push(`⏰ Taskingiz muddati o‘tdi`, head);
      else lines.push(`⏰ Muddati o‘tdi`, head, `👤 Bajaruvchi: ${escapeHtml(task.assigneeName ?? '—')}`);
      if (task.dueDate) lines.push(`📅 Muddat edi: ${day(task.dueDate, task.dueTime)}`);
      lines.push(`📁 ${escapeHtml(task.projectName)}`);
      break;
  }
  return { text: lines.join('\n') + quote, buttons: taskButtons(input, task) };
}
