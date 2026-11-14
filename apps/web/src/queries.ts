import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import type { Dashboard, Member, ProjectDetail, ProjectSummary, RolesResponse, Task, TaskDetail } from './types'

export const keys = {
  projects: (archived: boolean) => ['projects', { archived }] as const,
  project: (id: string) => ['project', id] as const,
  tasks: (projectId: string) => ['tasks', projectId] as const,
  task: (projectId: string, ref: string) => ['task', projectId, ref] as const,
  myTasks: (all: boolean) => ['my-tasks', { all }] as const,
  workspaceMembers: ['workspace-members'] as const,
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

export const useWorkspaceMembers = () =>
  useQuery({ queryKey: keys.workspaceMembers, queryFn: () => api<Member[]>('/workspace/members') })

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
