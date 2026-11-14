export type ProjectStatus = 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED'
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
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
  completedAt: string | null
  status: Omit<WorkflowStatus, 'order'>
  assignee: Person | null
  reporter: Person | null
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
}

export interface DashboardPerson {
  userId: string
  name: string
  avatarUrl: string | null
}

export interface Dashboard {
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
    assignee: DashboardPerson | null
    dueDate: string
    daysLate: number
  }[]
  people: (DashboardPerson & { role: string; open: number; inProgress: number; review: number; overdue: number; doneThisWeek: number })[]
  doneThisWeek: {
    id: string
    key: string
    number: number
    title: string
    project: { id: string; name: string }
    assignee: DashboardPerson | null
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
