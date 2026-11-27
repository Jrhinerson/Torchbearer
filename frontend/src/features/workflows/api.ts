import { requestJson } from '../../lib/api'

export interface WorkflowDefinition {
  key: string
  name: string
  description: string
  steps: string[]
  outputs: string[]
  validation: string[]
  approval_points: string[]
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
