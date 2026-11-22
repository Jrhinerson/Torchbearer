import { requestJson } from '../../lib/api'

export type Stage = 'plan' | 'integrate' | 'test'
export type Agent = 'codex' | 'claude' | 'pi'
export interface Repository {
  id: string
  name: string
  path: string
}
export interface Routing {
  agents: { id: Agent; label: string; available: boolean }[]
  assignments: Record<Stage, Agent | ''>
}

export interface Task {
  id: string
  title: string
  description: string
  repository: string | null
  status: 'backlog' | Stage | 'final_approval'
  created_at: string
  updated_at: string
}

export function listTasks(signal?: AbortSignal) {
  return requestJson<Task[]>('tasks/', { signal })
}

export async function writeJson<T>(
  path: string,
  method: string,
  body?: unknown,
) {
  const { csrfToken } = await requestJson<{ csrfToken: string }>('csrf/')
  return requestJson<T>(path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export function createTask(
  title: string,
  description: string,
  repository = '',
) {
  return writeJson<Task>('tasks/', 'POST', {
    title: title.trim(),
    description: description.trim(),
    ...(repository ? { repository } : {}),
  })
}

export function deleteTask(id: string) {
  return writeJson<void>(`tasks/${encodeURIComponent(id)}/`, 'DELETE')
}

export const getRouting = (signal?: AbortSignal) =>
  requestJson<Routing>('routing/', { signal })
export const listRepositories = (signal?: AbortSignal) =>
  requestJson<Repository[]>('repositories/', { signal })
export const addRepository = (path: string) =>
  writeJson<Repository>('repositories/', 'POST', { path })
export const assignAgent = (stage: Stage, agent: Agent | '') =>
  writeJson(`routing/${stage}/`, 'PATCH', { agent })
export const setTaskRepository = (id: string, repository: string) =>
  writeJson<Task>(`tasks/${id}/`, 'PATCH', { repository })
