import { requestJson } from '../../lib/api'

export interface Task {
  id: string
  title: string
  description: string
  status: 'backlog'
  created_at: string
  updated_at: string
}

export function listTasks(signal?: AbortSignal) {
  return requestJson<Task[]>('tasks/', { signal })
}

export async function createTask(title: string, description: string) {
  const { csrfToken } = await requestJson<{ csrfToken: string }>('csrf/')
  return requestJson<Task>('tasks/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
    body: JSON.stringify({
      title: title.trim(),
      description: description.trim(),
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
