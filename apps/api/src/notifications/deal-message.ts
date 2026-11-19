import { escapeHtml, type MessageButton, type RenderedMessage } from './notification-message.js';

export type DealKind =
  | 'deal_created'
  | 'deal_stage'
  | 'deal_owner'
  | 'deal_due'
  | 'deal_step_due'
  | 'deal_step_overdue'
  | 'payment_pending'
  | 'payment_received'
  | 'payment_confirmed'
  | 'payment_rejected'
  | 'deal_ready';

const PAYMENT_KIND: Record<string, string> = { ADVANCE: 'Avans', INTERIM: 'Oraliq to‘lov', FINAL: 'Yakuniy to‘lov' };

export const DEAL_STAGE_LABELS: Record<string, string> = {
  NEW: 'Yangi so‘rov',
  DISCUSSION: 'Muhokama',
  PROPOSAL: 'Taklif yuborildi',
  CONTRACT: 'Shartnoma',
  ADVANCE: 'Avans kutilmoqda',
  WON: 'Yutildi',
  LOST: 'Yo‘qotildi',
};

export interface DealMessageInput {
  kind: DealKind;
  recipientId: string;
  actorName: string | null;
  webOrigin: string;
  deal: {
    number: number;
    title: string;
    clientName: string;
    stage: string;
    amount: string | null;
    currency: string;
    ownerId: string | null;
    ownerName: string | null;
    nextStep: string | null;
    nextStepAt: Date | null;
  };
  changes?: { stage?: { from: string | null; to: string | null }; due?: { from: string | null; to: string | null } };
  reason?: string | null;
  /** To'lov xabarlari uchun. */
  payment?: { id: string; amount: string; currency: string; method: string; kind: string; paidAt: string; note: string | null; rejectReason: string | null; receipts: number };
  /** Pul holati: to'langan / kelishuv summasi, kerakli avans. */
  money?: { paid: string; amount: string | null; advanceDue: string | null; advancePercent: number };
}

const TASHKENT = 'Asia/Tashkent';

/** "25.11.2026 15:00" (Toshkent vaqti). */
export function formatWhen(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TASHKENT,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('day')}.${get('month')}.${get('year')} ${get('hour')}:${get('minute')}`;
}

/** `2026-12-01` → `01.12.2026`. */
const day = (iso: string | null | undefined) => (iso ? iso.split('-').reverse().join('.') : '—');

/** 150000000 UZS → "150 000 000 so‘m"; 2500.5 USD → "$2 500.50". */
export function formatMoney(amount: string | null, currency: string): string | null {
  if (amount === null) return null;
  const [int, frac] = amount.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const cents = frac && Number(frac) > 0 ? `.${frac.padEnd(2, '0')}` : '';
  return currency === 'USD' ? `$${grouped}${cents}` : `${grouped}${cents} so‘m`;
}

/** Kelishuv haqida Telegram xabari (faqat savdo bo'limi va rahbarga boradi). */
export function renderDealMessage(input: DealMessageInput): RenderedMessage {
  const d = input.deal;
  const actor = escapeHtml(input.actorName ?? 'Kimdir');
  const head = `<b>K-${d.number}</b> · ${escapeHtml(d.title)}`;
  const client = `👤 ${escapeHtml(d.clientName)}`;
  const amount = formatMoney(d.amount, d.currency);
  const lines: string[] = [];
  const step = d.nextStep ? `➡️ ${escapeHtml(d.nextStep)}${d.nextStepAt ? ` — ${formatWhen(d.nextStepAt)}` : ''}` : null;
  const owner = d.ownerName ? `Mas’ul: ${escapeHtml(d.ownerName)}` : null;

  switch (input.kind) {
    case 'deal_created':
      lines.push('💼 Yangi so‘rov', head, client);
      if (amount) lines.push(`💰 ${amount}`);
      if (owner) lines.push(owner);
      if (step) lines.push(step);
      break;
    case 'deal_stage': {
      const to = input.changes?.stage?.to ?? d.stage;
      const from = input.changes?.stage?.from ?? '';
      const mark = to === 'LOST' ? '❌' : to === 'WON' ? '✅' : '📈';
      lines.push(`${mark} ${actor}: ${DEAL_STAGE_LABELS[from] ?? from} → <b>${DEAL_STAGE_LABELS[to] ?? to}</b>`, head, client);
      if (amount) lines.push(`💰 ${amount}`);
      if (to === 'LOST' && input.reason) lines.push(`Sabab: ${escapeHtml(input.reason)}`);
      break;
    }
    case 'deal_owner':
      lines.push(`📌 ${actor} sizni kelishuvga mas’ul qildi`, head, client);
      if (step) lines.push(step);
      break;
    case 'deal_due': {
      const due = input.changes?.due;
      lines.push(`📅 ${actor} topshirish muddatini o‘zgartirdi`, head, client, `${day(due?.from)} → <b>${day(due?.to)}</b>`);
      if (input.reason) lines.push(`Sabab: ${escapeHtml(input.reason)}`);
      break;
    }
    case 'deal_step_due':
      lines.push('⏰ Kelishuv bo‘yicha keyingi qadam vaqti keldi', head, client);
      if (step) lines.push(step);
      lines.push('Bajargach, natijasini yozib, yangi qadam qo‘ying.');
      break;
    case 'payment_pending':
    case 'payment_received':
    case 'payment_confirmed':
    case 'payment_rejected': {
      const p = input.payment;
      const title = {
        payment_pending: '💵 Naqd to‘lov — tasdiqlang',
        payment_received: '💳 Plastik to‘lov tushdi',
        payment_confirmed: `✅ ${actor} naqd to‘lovni tasdiqladi`,
        payment_rejected: `❌ ${actor} naqd to‘lovni rad etdi`,
      }[input.kind];
      lines.push(title, head, client);
      if (p) {
        lines.push(`💰 <b>${formatMoney(p.amount, p.currency)}</b> · ${PAYMENT_KIND[p.kind] ?? p.kind} · ${day(p.paidAt)}`);
        if (input.kind === 'payment_pending' || input.kind === 'payment_received') lines.push(`Kiritdi: ${actor}${p.receipts ? ` · 📎 chek (${p.receipts})` : ''}`);
        if (p.note) lines.push(`Izoh: ${escapeHtml(p.note)}`);
        if (input.kind === 'payment_rejected' && p.rejectReason) lines.push(`Sabab: ${escapeHtml(p.rejectReason)}`);
      }
      if (input.money?.amount) lines.push(`To‘langan: ${formatMoney(input.money.paid, d.currency)} / ${formatMoney(input.money.amount, d.currency)}`);
      break;
    }
    case 'deal_ready': {
      const m = input.money;
      lines.push('🚀 Avans tushdi — loyihani boshlaymizmi?', head, client);
      if (m?.amount) lines.push(`To‘langan: ${formatMoney(m.paid, d.currency)} (kerak edi ${m.advancePercent}% — ${formatMoney(m.advanceDue, d.currency)})`);
      if (owner) lines.push(owner);
      lines.push('Kelishuvni ochib, “Loyihani boshlash” tugmasini bosing.');
      break;
    }
    case 'deal_step_overdue':
      lines.push('⚠️ Kelishuv qotib qoldi: keyingi qadam 24 soatdan beri bajarilmagan', head, client);
      if (owner) lines.push(owner);
      if (step) lines.push(step);
      break;
  }

  const buttons: MessageButton[][] = [];
  // Naqd to'lovni rahbar Telegram'ning o'zida tasdiqlay oladi (rad etish — sabab bilan, portalda).
  if (input.kind === 'payment_pending' && input.payment) buttons.push([{ text: '✅ Tasdiqlash', callbackData: `pay:${input.payment.id}:ok` }]);
  if (input.webOrigin.startsWith('https://')) buttons.push([{ text: 'Ochish', webAppUrl: `${input.webOrigin.replace(/\/$/, '')}/deals/${d.number}` }]);
  return { text: lines.join('\n'), buttons };
}
