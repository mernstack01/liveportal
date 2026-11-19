export type ProjectStatus = 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED'
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
export type TaskType = 'TASK' | 'BUG' | 'FEATURE'
export type StatusCategory = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE' | 'CANCELED'

export interface Person {
  userId: string
  name: string
  telegramUsername: string | null
  avatarUrl: string | null
}

export interface Member extends Person {
  role: string
  joinedAt: string
  /** Loyiha a'zolarida: mijoz (board va ichki chatni ko'rmaydi). */
  isClient?: boolean
  /** Jamoa ro'yxatida: shu odamni men o'zgartira yoki chiqara olamanmi. */
  canManage?: boolean
  /** Jamoa ro'yxatida: qo'shimcha workspace rollari (masalan "sales"). */
  extraRoles?: string[]
}

export interface ProjectSummary {
  id: string
  key: string
  name: string
  description: string | null
  status: ProjectStatus
  startDate: string | null
  dueDate: string | null
  createdAt: string
  updatedAt: string
  myRole: string | null
  memberCount: number
}

export interface WorkflowStatus {
  id: string
  name: string
  category: StatusCategory
  color: string | null
  order: number
}

export interface ProjectDetail extends Omit<ProjectSummary, 'memberCount'> {
  statuses: WorkflowStatus[]
  members: Member[]
  myPermissions: string[]
  /** Hal qilinmagan insidentlar soni; insidentlarni ko'ra olmaydiganda null. */
  openIncidents: number | null
}

export interface Task {
  id: string
  key: string
  number: number
  project: { id: string; key: string; name: string }
  title: string
  description: string | null
  priority: Priority
  dueDate: string | null
  /** "HH:MM" Toshkent vaqti; bo'lsa, muddat aynan shu daqiqada tugaydi. */
  dueTime: string | null
  completedAt: string | null
  status: Omit<WorkflowStatus, 'order'>
  /** Mas'ullar: bir nechta odam birga javobgar bo'lishi mumkin. */
  assignees: Person[]
  reporter: Person | null
  /** Insidentdan yaratilgan bo'lsa. */
  incident: { id: string; number: number; key: string; title: string; status: IncidentStatus; severity: IncidentSeverity } | null
  type: TaskType
  /** Kichik vazifa bo'lsa — ota task. */
  parent: { id: string; number: number; key: string; title: string } | null
  /** Kichik vazifalar: jami va yopilgani. */
  subtaskCount: { total: number; done: number }
  createdAt: string
  updatedAt: string
}

export interface Comment {
  id: string
  author: Person | null
  body: string
  mentions: string[]
  createdAt: string
}

export interface TaskDetail extends Task {
  comments: Comment[]
  subtasks: Task[]
}

/** Task tarixidagi bitta yozuv. */
export type TaskHistoryEntry = { id: string; at: string; actor: { userId: string; name: string } | null } & (
  | { kind: 'created'; status: string | null }
  | { kind: 'subtask'; key: string; title: string }
  | { kind: 'status'; from: string | null; to: string | null }
  | { kind: 'assignees'; added: string[]; removed: string[]; claimed: boolean; left: boolean }
  | { kind: 'fields'; changes: { field: string; from?: string | null; to?: string | null }[] }
  | { kind: 'comment' }
  | { kind: 'overdue' }
)

export interface DashboardPerson {
  userId: string
  name: string
  avatarUrl: string | null
}

export interface Dashboard {
  /** Hal qilinmagan insidentlar, eng og'iri birinchi. */
  openIncidents: {
    id: string
    number: number
    key: string
    title: string
    severity: IncidentSeverity
    status: IncidentStatus
    startedAt: string
    project: { id: string; key: string; name: string }
    owner: DashboardPerson | null
  }[]
  today: string
  weekStart: string
  summary: { activeProjects: number; openTasks: number; inReview: number; overdue: number; doneThisWeek: number; unassigned: number }
  projects: {
    id: string
    key: string
    name: string
    status: ProjectStatus
    dueDate: string | null
    total: number
    counts: Record<StatusCategory, number>
    progress: number
    overdue: number
    late: boolean
  }[]
  overdue: {
    id: string
    key: string
    number: number
    title: string
    project: { id: string; name: string }
    assignees: DashboardPerson[]
    dueDate: string
    dueTime: string | null
    daysLate: number
  }[]
  people: (DashboardPerson & { role: string; open: number; inProgress: number; review: number; overdue: number; doneThisWeek: number })[]
  doneThisWeek: {
    id: string
    key: string
    number: number
    title: string
    project: { id: string; name: string }
    assignees: DashboardPerson[]
    completedAt: string
  }[]
}

export interface RoleInfo {
  id: string
  name: string
  title: string
  scope: 'WORKSPACE' | 'PROJECT'
  permissions: string[]
  isSystem: boolean
  members: number
}

export interface RolesResponse {
  canManage: boolean
  permissions: { key: string; label: string; group: string; allowed: boolean }[]
  roles: RoleInfo[]
}

export interface ChatAttachment {
  id: string
  fileName: string
  kind: 'image' | 'file'
  mimeType: string
  size: number
  /** Imzolangan, 1 soat amal qiladi (ro'yxat yangilanganda yangilanadi). */
  url: string
}

export interface ChatMessage {
  id: string
  body: string
  createdAt: string
  editedAt: string | null
  author: (Person & { telegramUsername: string | null }) | null
  attachments: ChatAttachment[]
}

export interface ChatPage {
  canWrite: boolean
  hasMore: boolean
  messages: ChatMessage[]
}

export type IncidentSeverity = 'SEV1' | 'SEV2' | 'SEV3' | 'SEV4'
export type IncidentStatus = 'OPEN' | 'INVESTIGATING' | 'MONITORING' | 'RESOLVED'

export interface Incident {
  id: string
  number: number
  key: string
  projectId: string
  title: string
  description: string | null
  severity: IncidentSeverity
  status: IncidentStatus
  reporter: Person | null
  owner: Person | null
  startedAt: string
  resolvedAt: string | null
  resolution: string | null
  createdAt: string
  updatedAt: string
}

export interface IncidentUpdate {
  id: string
  /** 'created' | 'note' | 'status' | 'severity' | 'owner' */
  kind: string
  body: string
  from: string | null
  to: string | null
  author: Person | null
  /** Qo'lda yozilgan yangilanishdagi skrinshot va fayllar. */
  attachments: ChatAttachment[]
  createdAt: string
}

export interface IncidentTask {
  id: string
  number: number
  key: string
  title: string
  status: { name: string; category: StatusCategory; color: string | null }
  assignees: Person[]
}

export interface IncidentDetail extends Incident {
  updates: IncidentUpdate[]
  /** Insidentdan kelib chiqqan tasklar (tuzatish, keyingi qadamlar). */
  tasks: IncidentTask[]
}
