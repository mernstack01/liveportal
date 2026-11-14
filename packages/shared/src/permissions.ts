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
  'member.role.assign',
  'dashboard.view_all',
  'project.create',
  'project.update',
  'project.archive',
  'project.member.manage',
  'task.create',
  'task.update',
  'task.assign',
  'task.close',
  'task.comment',
  'message.internal.read',
  'message.external.read',
  'message.external.write',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type RoleScope = 'WORKSPACE' | 'PROJECT';

export interface SystemRole {
  name: string;
  scope: RoleScope;
  permissions: readonly Permission[];
}

const ALL = PERMISSIONS;
const ADMIN = PERMISSIONS.filter((p) => p !== 'workspace.owner');

export const SYSTEM_ROLES: readonly SystemRole[] = [
  { name: 'owner', scope: 'WORKSPACE', permissions: ALL },
  { name: 'admin', scope: 'WORKSPACE', permissions: ADMIN },
  { name: 'member', scope: 'WORKSPACE', permissions: ['project.create'] },
  {
    name: 'teamlead',
    scope: 'PROJECT',
    permissions: [
      'project.update',
      'project.archive',
      'project.member.manage',
      'task.create',
      'task.update',
      'task.assign',
      'task.close',
      'task.comment',
      'message.internal.read',
      'message.external.read',
      'message.external.write',
    ],
  },
  {
    name: 'mentor',
    scope: 'PROJECT',
    permissions: ['task.create', 'task.update', 'task.assign', 'task.comment', 'message.internal.read'],
  },
  {
    name: 'guest',
    scope: 'PROJECT',
    permissions: ['message.external.read', 'message.external.write'],
  },
];
