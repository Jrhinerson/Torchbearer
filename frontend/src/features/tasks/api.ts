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
  worker: {
    available: boolean
    heartbeat: string | null
    active_run: string | null
  }
}

export type RunState =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'blocked'
  | 'failed'
  | 'cancelled'
  | 'interrupted'
export interface RunSummary {
  id: string
  stage: Stage
  agent: Agent
  state: RunState
  sequence: number
  error: string
  cancel_requested: boolean
}
export interface Run extends RunSummary {
  result: {
    outcome?: string
    summary?: string
    details?: string
    tests?: { command: string; outcome: string; details: string }[]
  }
  log: string
  feedback: string
  cli_version: string
  review_fingerprint: string
  created_at: string
  started_at: string | null
  finished_at: string | null
}
export interface Decision {
  id: number
  action: string
  from_stage: string
  to_stage: string
  feedback: string
  created_at: string
}
export interface RunHistory {
  runs: Run[]
  decisions: Decision[]
}
export interface WorkspaceChanges {
  diff: string
  fingerprint: string
  truncated: boolean
}

export interface Task {
  id: string
  title: string
  description: string
  repository: string | null
  status: 'backlog' | Stage | 'final_approval'
  revision: number
  completed_at: string | null
  latest_run: RunSummary | null
  workspace_path: string
  branch: string
  base_commit: string
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

export type TaskAction =
  'start' | 'approve' | 'retry' | 'revise' | 'send_back' | 'final_approve'
export const performAction = (
  task: Task,
  action: TaskAction,
  run?: Run,
  feedback = '',
) =>
  writeJson<Task>(`tasks/${task.id}/actions/`, 'POST', {
    action,
    revision: task.revision,
    ...(run ? { run_id: run.id, fingerprint: run.review_fingerprint } : {}),
    feedback,
  })
export const cancelRun = (task: Task) =>
  writeJson<Task>(
    `tasks/${task.id}/runs/${task.latest_run!.id}/cancel/`,
    'POST',
  )
export const getRuns = (id: string, signal?: AbortSignal) =>
  requestJson<RunHistory>(`tasks/${id}/runs/`, { signal })
export const getWorkspace = (id: string, signal?: AbortSignal) =>
  requestJson<WorkspaceChanges>(`tasks/${id}/workspace/`, { signal })
