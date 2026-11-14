/** Domen hodisalari nomlari (docs/03). Modullar bir-biriga emas, shu eventlarga bog'lanadi. */
export const EVENT_TYPES = [
  'project.created',
  'project.member_added',
  'project.member_role_changed',
  'project.member_removed',
  'project.updated',
  'project.status_changed',
  'task.created',
  'task.assigned',
  'task.status_changed',
  'task.due_soon',
  'task.overdue',
  'task.commented',
  'task.mentioned',
  'message.posted',
  'message.external_received',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];
