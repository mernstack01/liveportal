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
