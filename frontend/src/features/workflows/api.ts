import { requestJson } from '../../lib/api'

export interface WorkflowDefinition {
  key: string
  name: string
  description: string
  steps: string[]
  outputs: string[]
  validation: string[]
  approval_points: string[]
  has_graph: boolean
}

export interface WorkflowRequirement {
  id: string
  description: string
  kind: 'requirement' | 'validation' | 'approval'
  applicability: 'always' | 'when_relevant'
  applicability_note?: string
}

export interface WorkflowNode {
  id: string
  title: string
  description: string
  requirements: WorkflowRequirement[]
  outputs: string[]
  iteration_note?: string
  position: { x: number; y: number }
}

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  condition: string
}

export interface WorkflowGraph {
  schema_version: 1
  entry_node_id: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

export interface WorkflowGraphDetail {
  key: string
  name: string
  description: string
  graph: WorkflowGraph | null
  revision: number
  updated_at: string | null
}

export function getWorkflowGraph(key: string, signal?: AbortSignal) {
  return requestJson<WorkflowGraphDetail>(
    `workflows/${encodeURIComponent(key)}/graph/`,
    { signal },
  )
}

export interface WorkType {
  key: string
  name: string
  description: string
  assigned_workflow: string
  recommended_workflow: string
  revision: number
  updated_at: string
}

export function listWorkflows(signal?: AbortSignal) {
  return requestJson<WorkflowDefinition[]>('workflows/', { signal })
}

export function listWorkTypes(signal?: AbortSignal) {
  return requestJson<WorkType[]>('work-types/', { signal })
}

export function getWorkType(key: string) {
  return requestJson<WorkType>(`work-types/${encodeURIComponent(key)}/`)
}

export async function saveAssignment(workType: WorkType, workflow: string) {
  const { csrfToken } = await requestJson<{ csrfToken: string }>('csrf/')
  return requestJson<WorkType>(
    `work-types/${encodeURIComponent(workType.key)}/`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
      body: JSON.stringify({
        assigned_workflow: workflow,
        revision: workType.revision,
      }),
    },
  )
}
