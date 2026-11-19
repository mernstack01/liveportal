import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import type { Dashboard, Incident, IncidentDetail, Member, Person, ProjectDetail, ProjectSummary, RolesResponse, Task, TaskDetail } from './types'
import type { Deal, DealDetail, Payment } from './deals/labels'

export const keys = {
  projects: (archived: boolean) => ['projects', { archived }] as const,
  project: (id: string) => ['project', id] as const,
  tasks: (projectId: string) => ['tasks', projectId] as const,
  task: (projectId: string, ref: string) => ['task', projectId, ref] as const,
  myTasks: (all: boolean) => ['my-tasks', { all }] as const,
  workspaceMembers: ['workspace-members'] as const,
  incidents: (projectId: string) => ['incidents', projectId] as const,
  incident: (projectId: string, ref: string) => ['incident', projectId, ref] as const,
  deals: ['deals'] as const,
  deal: (ref: string) => ['deal', ref] as const,
  dealOwners: ['deal-owners'] as const,
  dealPayments: (ref: string) => ['deal-payments', ref] as const,
}

export const useProjects = (archived: boolean) =>
  useQuery({
    queryKey: keys.projects(archived),
    queryFn: () => api<ProjectSummary[]>(`/projects${archived ? '?archived=true' : ''}`),
  })

export const useProject = (id: string) =>
  useQuery({ queryKey: keys.project(id), queryFn: () => api<ProjectDetail>(`/projects/${id}`) })

/** Board 15 soniyada yangilanadi (real-time v1 da, docs/09). */
export const useTasks = (projectId: string) =>
  useQuery({
    queryKey: keys.tasks(projectId),
    queryFn: () => api<Task[]>(`/projects/${projectId}/tasks`),
    refetchInterval: 15_000,
  })

/** Xodimlar ro'yxati (team.view). Mijozda yo'q, shuning uchun kerak bo'lgandagina so'raladi. */
export const useWorkspaceMembers = (enabled = true) =>
  useQuery({ queryKey: keys.workspaceMembers, queryFn: () => api<Member[]>('/workspace/members'), enabled })

/** `ref` — task raqami (URL'da `/tasks/12`) yoki id. */
export const useTask = (projectId: string, ref: string) =>
  useQuery({
    queryKey: keys.task(projectId, ref),
    queryFn: () => api<TaskDetail>(`/projects/${projectId}/tasks/${ref}`),
    refetchInterval: 15_000,
  })

export const useMyTasks = (all: boolean) =>
  useQuery({ queryKey: keys.myTasks(all), queryFn: () => api<Task[]>(`/tasks/mine${all ? '?all=true' : ''}`), refetchInterval: 30_000 })

export const useDashboard = () =>
  useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('/dashboard'), refetchInterval: 60_000 })

export const useRoles = () => useQuery({ queryKey: ['roles'], queryFn: () => api<RolesResponse>('/roles'), staleTime: 60_000 })

export const useIncidents = (projectId: string) =>
  useQuery({ queryKey: keys.incidents(projectId), queryFn: () => api<Incident[]>(`/projects/${projectId}/incidents`) })

/** `ref` — insident raqami (URL'da `/incidents/3`) yoki id. */
export const useIncident = (projectId: string, ref: string) =>
  useQuery({ queryKey: keys.incident(projectId, ref), queryFn: () => api<IncidentDetail>(`/projects/${projectId}/incidents/${ref}`) })

/** Kelishuvlar (savdo bo'limi): 30 soniyada yangilanadi. */
export const useDeals = () => useQuery({ queryKey: keys.deals, queryFn: () => api<Deal[]>('/deals'), refetchInterval: 30_000 })

/** `ref` — kelishuv raqami (URL'da `/deals/12`) yoki id. */
export const useDeal = (ref: string) => useQuery({ queryKey: keys.deal(ref), queryFn: () => api<DealDetail>(`/deals/${ref}`) })

export const useDealOwners = () => useQuery({ queryKey: keys.dealOwners, queryFn: () => api<Person[]>('/deals/owners'), staleTime: 60_000 })

export const useDealPayments = (ref: string) => useQuery({ queryKey: keys.dealPayments(ref), queryFn: () => api<Payment[]>(`/deals/${ref}/payments`) })
