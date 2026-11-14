import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import type { Member, ProjectDetail, ProjectSummary, Task } from './types'

export const keys = {
  projects: (archived: boolean) => ['projects', { archived }] as const,
  project: (id: string) => ['project', id] as const,
  tasks: (projectId: string) => ['tasks', projectId] as const,
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
