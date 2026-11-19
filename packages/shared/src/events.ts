/** Domen hodisalari nomlari (docs/03). Modullar bir-biriga emas, shu eventlarga bog'lanadi. */
export const EVENT_TYPES = [
  /** Workspace xodimi: roli o'zgardi yoki chiqarildi (entityType 'user'). */
  'member.role_changed',
  'member.extra_roles_changed',
  'member.removed',
  'project.created',
  'project.member_added',
  'project.member_role_changed',
  'project.member_removed',
  'project.updated',
  'project.status_changed',
  'task.created',
  'task.updated',
  'task.assigned',
  'task.status_changed',
  'task.due_soon',
  'task.overdue',
  /** Ertalabki xulosa: bitta odam uchun (entityType 'user'). */
  'user.digest',
  'task.commented',
  'task.mentioned',
  'incident.created',
  /** Holat, daraja yoki mas'ul o'zgardi (payload.changes). */
  'incident.updated',
  /** Xronologiyaga qo'lda yangilanish yozildi. */
  'incident.noted',
  /** Kelishuvlar (savdo): entityType 'deal'. */
  'deal.created',
  /** Bosqich, mas'ul, muddat yoki summa o'zgardi (payload.changes). */
  'deal.updated',
  /** Keyingi qadam vaqti keldi (mas'ulga) va 24 soat o'tib ham yangilanmadi (rahbarga). */
  'deal.step_due',
  'deal.step_overdue',
  'message.posted',
  'message.external_received',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];
