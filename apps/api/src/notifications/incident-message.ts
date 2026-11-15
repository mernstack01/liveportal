import { escapeHtml, type MessageButton, type RenderedMessage } from './notification-message.js';

export type IncidentKind = 'incident_opened' | 'incident_owner' | 'incident_status' | 'incident_note';

export const SEVERITY_LABELS: Record<string, string> = {
  SEV1: '🔴 SEV1 · Kritik',
  SEV2: '🟠 SEV2 · Jiddiy',
  SEV3: '🟡 SEV3 · O‘rtacha',
  SEV4: '⚪ SEV4 · Kichik',
};
export const INCIDENT_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Ochiq',
  INVESTIGATING: 'Tekshirilmoqda',
  MONITORING: 'Kuzatuvda',
  RESOLVED: 'Hal qilindi',
};

export interface IncidentMessageInput {
  kind: IncidentKind;
  actorName: string | null;
  webOrigin: string;
  incident: {
    number: number;
    title: string;
    description: string | null;
    severity: string;
    status: string;
    ownerName: string | null;
    startedAt: Date;
    resolvedAt: Date | null;
    resolution: string | null;
    projectId: string;
    projectKey: string;
    projectName: string;
  };
  /** incident.updated: nima o'zgardi. */
  changes?: { status?: { from: string | null; to: string | null }; severity?: { from: string | null; to: string | null } };
  noteBody?: string;
}

function excerpt(text: string, max = 300): string {
  const clean = text.trim().replace(/\n{3,}/g, '\n\n');
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

const quote = (text: string | null | undefined) => (text ? `\n\n<blockquote>${escapeHtml(excerpt(text))}</blockquote>` : '');

/** "1 soat 20 daqiqa", "2 kun 3 soat", "1 daqiqadan kam". */
export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return '1 daqiqadan kam';
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return hours > 0 ? `${days} kun ${hours} soat` : `${days} kun`;
  if (hours > 0) return mins > 0 ? `${hours} soat ${mins} daqiqa` : `${hours} soat`;
  return `${mins} daqiqa`;
}

/** Insident haqida Telegram xabari. */
export function renderIncidentMessage(input: IncidentMessageInput): RenderedMessage {
  const i = input.incident;
  const actor = escapeHtml(input.actorName ?? 'Kimdir');
  const head = `<b>${escapeHtml(i.projectKey)} · INC-${i.number}</b> · ${escapeHtml(i.title)}`;
  const severity = SEVERITY_LABELS[i.severity] ?? i.severity;
  const status = INCIDENT_STATUS_LABELS[i.status] ?? i.status;
  const lines: string[] = [];
  let body = '';

  switch (input.kind) {
    case 'incident_opened':
      lines.push(`🚨 Yangi insident · ${severity}`, head, `📁 ${escapeHtml(i.projectName)}`, `Xabar berdi: ${actor}`);
      lines.push(i.ownerName ? `Mas’ul: ${escapeHtml(i.ownerName)}` : 'Mas’ul: hali yo‘q — kim oladi?');
      body = quote(i.description);
      break;
    case 'incident_owner':
      lines.push(`🧯 ${actor} sizni insidentga mas’ul qildi`, head, `${severity} · ${status}`);
      body = quote(i.description);
      break;
    case 'incident_status': {
      const s = input.changes?.status;
      const sev = input.changes?.severity;
      if (s?.to === 'RESOLVED') {
        lines.push('✅ Insident hal qilindi', head, `${actor} · davomiyligi ${formatDuration((i.resolvedAt ?? new Date()).getTime() - i.startedAt.getTime())}`);
        body = i.resolution ? `\n\nSabab va yechim:${quote(i.resolution)}` : '';
      } else {
        lines.push(s?.from === 'RESOLVED' ? '🔁 Insident qayta ochildi' : '🛠 Insident yangilandi', head);
        if (s) lines.push(`Holat: ${INCIDENT_STATUS_LABELS[s.from ?? ''] ?? s.from} → <b>${INCIDENT_STATUS_LABELS[s.to ?? ''] ?? s.to}</b>`);
        if (sev) lines.push(`Daraja: ${sev.from} → <b>${SEVERITY_LABELS[sev.to ?? ''] ?? sev.to}</b>`);
        lines.push(actor);
      }
      break;
    }
    case 'incident_note':
      lines.push(`📝 ${actor} insidentga yangilanish yozdi`, head, `${severity} · ${status}`);
      body = quote(input.noteBody);
      break;
  }

  const buttons: MessageButton[][] = input.webOrigin.startsWith('https://')
    ? [[{ text: 'Ochish', webAppUrl: `${input.webOrigin.replace(/\/$/, '')}/projects/${i.projectId}/incidents/${i.number}` }]]
    : [];
  return { text: lines.join('\n') + body, buttons };
}
