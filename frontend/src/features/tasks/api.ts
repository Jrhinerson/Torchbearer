import { requestJson } from '../../lib/api'
import type { Project } from '../projects/api'

export type Stage = 'plan' | 'integrate' | 'code_review'
export type SupportStage = 'refine' | 'retro'
export type Agent = 'codex' | 'claude' | 'pi'
export type Approach = 'frontier' | 'hybrid' | 'local_only'
export type FrontierAgent = Exclude<Agent, 'pi'>
export interface Repository {
  id: string
  name: string
  path: string
}
export interface Routing {
  agents: {
    id: Agent
    label: string
    kind: 'frontier' | 'local'
    available: boolean
  }[]
  approaches: { id: Approach; label: string }[]
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
  stage: Stage | SupportStage | 'test'
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
  input_context?: {
    artifacts?: {
      implementation?: {
        run_id: string
        result: Run['result']
      }
    }
  }
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
  project: Project | null
  repository: string | null
  routing_mode: Approach | null
  frontier_agent: FrontierAgent | null
  stage_agents: Partial<Record<Stage | SupportStage, Agent>>
  next_stage: Stage | 'final_approval' | null
  status: 'backlog' | Stage | 'final_approval'
  revision: number
  completed_at: string | null
  latest_run: RunSummary | null
  workspace_path: string
  branch: string
  base_commit: string
  created_at: string
  updated_at: string
  operations?: {
    group: 'backlog' | 'active' | 'needs_you' | 'done'
    reason: string
    state: string
    agent: Agent | null
    next_agent: Agent | null
    running: boolean
    stage_label: string
    workflow_name: string
  }
}

export interface OperationsOverview {
  tasks: Task[]
  counts: Record<'backlog' | 'active' | 'needs_you' | 'done', number>
  agents: (Routing['agents'][number] & { queued: number; running: number })[]
  worker: Routing['worker']
  observed_at: string
  filters: { project: string; q: string }
}

export const getOperations = (signal?: AbortSignal, query = '', project = '') =>
  requestJson<OperationsOverview>(
    `operations/?${new URLSearchParams({ q: query, project })}`,
    { signal },
  )

export interface FlowNode {
  id: string
  label: string
  kind: 'stage' | 'gate' | 'procedure'
  agent: Agent | 'human' | null
  state: string
  accepted?: boolean
  run_id: string | null
}
export interface TaskFlowData extends RunHistory {
  task_id: string
  revision: number
  latest_run_id: string | null
  nodes: FlowNode[]
  edges: {
    source: string
    target: string
    kind: string
    decision_id?: number
  }[]
  operations: NonNullable<Task['operations']>
}
export const getTaskFlow = (id: string, signal?: AbortSignal) =>
  requestJson<TaskFlowData>(`tasks/${id}/flow/`, { signal })

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
  routing_mode: Approach = 'frontier',
  frontier_agent: FrontierAgent | null = 'codex',
  projectId: string | null = null,
) {
  return writeJson<Task>('tasks/', 'POST', {
    title: title.trim(),
    description: description.trim(),
    routing_mode,
    frontier_agent: routing_mode === 'local_only' ? null : frontier_agent,
    project_id: projectId,
    ...(repository ? { repository } : {}),
  })
}

export function deleteTask(id: string) {
  return writeJson<void>(`tasks/${encodeURIComponent(id)}/`, 'DELETE')
}

export const getRouting = (signal?: AbortSignal) =>
  requestJson<Routing>('routing/', { signal })
export const agentLabel = (agent: Agent, routing: Routing | null) =>
  routing?.agents.find((entry) => entry.id === agent)?.label ?? agent
export const listRepositories = (signal?: AbortSignal) =>
  requestJson<Repository[]>('repositories/', { signal })
export const addRepository = (path: string) =>
  writeJson<Repository>('repositories/', 'POST', { path })
export const updateTaskSettings = (
  task: Task,
  settings: {
    repository?: string
    routing_mode?: Approach
    frontier_agent?: FrontierAgent | null
  },
) =>
  writeJson<Task>(`tasks/${task.id}/`, 'PATCH', {
    revision: task.revision,
    ...settings,
  })

export type TaskAction =
  | 'start'
  | 'plan_message'
  | 'approve'
  | 'retry'
  | 'revise'
  | 'send_back'
  | 'final_approve'
  | 'refine'
  | 'retro'
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
