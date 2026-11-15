/**
 * Ruxsatlar — kodda faqat nomlari turadi. Qaysi rolda qaysi ruxsat borligi
 * bazada (`Role.permissions`) saqlanadi; quyidagi `SYSTEM_ROLES` faqat seed uchun.
 * Yangi rol qo'shish = bazaga yangi qator, kod o'zgarmaydi. (docs/02)
 */
export const PERMISSIONS = [
  'workspace.manage',
  /** Faqat owner: workspace'ni o'chirish, egalikni topshirish. Admin owner yarata olmasligi shu bilan ta'minlanadi. */
  'workspace.owner',
  'member.invite',
  /** Workspace xodimlari ro'yxati va "Mening tasklarim". Mijozda yo'q. */
  'team.view',
  'member.role.assign',
  /** Xodimni workspace'dan chiqarish (sessiyalari yopiladi, loyihalar va tasklardan olinadi). */
  'member.remove',
  'dashboard.view_all',
  /** Yangi loyiha rollarini yaratish va tahrirlash (teamlead, admin, rahbar). */
  'role.manage',
  'project.create',
  'project.update',
  'project.archive',
  'project.member.manage',
  /** Board va tasklarni ko'rish. Mijozda yo'q: u faqat "Mijoz bilan" chatni ko'radi. */
  'task.view',
  'task.create',
  'task.update',
  'task.assign',
  'task.close',
  'task.comment',
  /** Insidentlarni ko'rish. */
  'incident.view',
  /** Insident ochish, holatini, darajasini, mas'ulini o'zgartirish, yangilanish yozish. */
  'incident.manage',
  /** Ichki (faqat xodimlar) chat: mehmon ko'rmaydi. */
  'message.internal.read',
  'message.internal.write',
  'message.external.read',
  'message.external.write',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type RoleScope = 'WORKSPACE' | 'PROJECT';

export interface SystemRole {
  name: string;
  /** Interfeysda ko'rinadigan nom. */
  title: string;
  scope: RoleScope;
  permissions: readonly Permission[];
}

/** Loyiha rollariga beriladigan ruxsatlar (rol yaratish oynasidagi ro'yxat), o'zbekcha nomi bilan. */
export const PROJECT_PERMISSIONS: readonly { key: Permission; label: string; group: string }[] = [
  { key: 'task.view', label: 'Board va tasklarni ko‘rish', group: 'Tasklar' },
  { key: 'task.create', label: 'Task yaratish', group: 'Tasklar' },
  { key: 'task.update', label: 'Taskni tahrirlash va holatini o‘zgartirish', group: 'Tasklar' },
  { key: 'task.assign', label: 'Task berish (bajaruvchi tayinlash)', group: 'Tasklar' },
  { key: 'task.close', label: 'Taskni yopish (Done)', group: 'Tasklar' },
  { key: 'task.comment', label: 'Izoh yozish', group: 'Tasklar' },
  { key: 'incident.view', label: 'Insidentlarni ko‘rish', group: 'Insidentlar' },
  { key: 'incident.manage', label: 'Insident ochish va boshqarish', group: 'Insidentlar' },
  { key: 'message.internal.read', label: 'Ichki chatni o‘qish', group: 'Chat' },
  { key: 'message.internal.write', label: 'Ichki chatga yozish', group: 'Chat' },
  { key: 'message.external.read', label: 'Mijoz chatini o‘qish', group: 'Chat' },
  { key: 'message.external.write', label: 'Mijoz chatiga yozish', group: 'Chat' },
  { key: 'project.update', label: 'Loyihani tahrirlash', group: 'Loyiha' },
  { key: 'project.archive', label: 'Loyihani arxivlash', group: 'Loyiha' },
  { key: 'project.member.manage', label: 'A’zolarni qo‘shish va chiqarish', group: 'Loyiha' },
  { key: 'role.manage', label: 'Rollarni yaratish', group: 'Loyiha' },
];

const ALL = PERMISSIONS;
const ADMIN = PERMISSIONS.filter((p) => p !== 'workspace.owner');

export const SYSTEM_ROLES: readonly SystemRole[] = [
  { name: 'owner', title: 'Rahbar', scope: 'WORKSPACE', permissions: ALL },
  { name: 'admin', title: 'Admin', scope: 'WORKSPACE', permissions: ADMIN },
  { name: 'member', title: 'A’zo', scope: 'WORKSPACE', permissions: ['team.view', 'project.create'] },
  // Tashqi odam: faqat o'zi qo'shilgan loyihalarning "Mijoz bilan" chati (loyiha roli 'guest' orqali).
  { name: 'client', title: 'Mijoz', scope: 'WORKSPACE', permissions: [] },
  {
    name: 'teamlead',
    title: 'Teamlead',
    scope: 'PROJECT',
    permissions: [
      'project.update',
      'project.archive',
      'project.member.manage',
      'role.manage',
      'task.view',
      'task.create',
      'task.update',
      'task.assign',
      'task.close',
      'task.comment',
      'incident.view',
      'incident.manage',
      'message.internal.read',
      'message.internal.write',
      'message.external.read',
      'message.external.write',
    ],
  },
  {
    // 2026-11-14 gacha "mentor" edi; migration bazadagi qatorni qayta nomlaydi.
    name: 'developer',
    title: 'Dasturchi',
    scope: 'PROJECT',
    permissions: ['task.view', 'task.create', 'task.update', 'task.assign', 'task.comment', 'incident.view', 'incident.manage', 'message.internal.read', 'message.internal.write'],
  },
  {
    // Nomi tarixan 'guest'; interfeysda "Mijoz".
    name: 'guest',
    title: 'Mijoz',
    scope: 'PROJECT',
    permissions: ['message.external.read', 'message.external.write'],
  },
];
