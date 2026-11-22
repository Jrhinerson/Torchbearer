import { requestJson } from '../../lib/api'
import type { Project } from '../projects/api'

export interface Task {
  id: string
  title: string
  description: string
  project: Project | null
  status: 'backlog'
  created_at: string
  updated_at: string
}

export function listTasks(signal?: AbortSignal) {
  return requestJson<Task[]>('tasks/', { signal })
}

export async function createTask(
  title: string,
  description: string,
  projectId: string | null = null,
) {
  const { csrfToken } = await requestJson<{ csrfToken: string }>('csrf/')
  return requestJson<Task>('tasks/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
    body: JSON.stringify({
      title: title.trim(),
      description: description.trim(),
      project_id: projectId,
    }),
  })
}

export async function deleteTask(id: string) {
  const { csrfToken } = await requestJson<{ csrfToken: string }>('csrf/')
  return requestJson<void>(`tasks/${encodeURIComponent(id)}/`, {
    method: 'DELETE',
    headers: { 'X-CSRFToken': csrfToken },
  })
}
