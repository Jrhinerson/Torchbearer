import type { Task, WorkflowSnapshot } from '../../../src/features/tasks/api'
import { taskCardStatus } from '../../../src/features/tasks/taskCardStatus'

export const legacyWorkflow: WorkflowSnapshot = {
  schema_version: 1,
  key: 'legacy-standard',
  name: 'Legacy engineering workflow',
  definition_version: 1,
  execution_mode: 'legacy',
  result_contract: 1,
  steps: [],
  stage_labels: {},
}

export function operationsFixture(input: unknown[]) {
  const tasks = input.map((value) => {
    const task = {
      project: null,
      work_type: null,
      workflow_snapshot: legacyWorkflow,
      ...(value as Partial<Task>),
    }
    const status = taskCardStatus(task as Task)
    const group = task.completed_at
      ? 'done'
      : ['queued', 'running'].includes(task.latest_run?.state ?? '')
        ? 'active'
        : task.status === 'backlog' && !task.latest_run && task.routing_mode
          ? 'backlog'
          : 'needs_you'
    return {
      ...task,
      operations: {
        group,
        reason: status.label,
        state: task.latest_run?.state ?? 'ready',
        agent: status.agent,
        next_agent: null,
        running: status.activity === 'running',
        stage_label: task.status,
        workflow_name: task.workflow_snapshot?.name ?? legacyWorkflow.name,
      },
    }
  })
  const counts = { backlog: 0, active: 0, needs_you: 0, done: 0 }
  tasks.forEach(
    (task) => counts[task.operations.group as keyof typeof counts]++,
  )
  return {
    tasks,
    counts,
    observed_at: new Date().toISOString(),
    filters: { q: '', project: '' },
    agents: [
      {
        id: 'codex',
        label: 'Codex',
        kind: 'frontier',
        available: true,
        queued: 0,
        running: 0,
      },
      {
        id: 'claude',
        label: 'Claude Code',
        kind: 'frontier',
        available: true,
        queued: 0,
        running: 0,
      },
      {
        id: 'pi',
        label: 'Pi',
        kind: 'local',
        available: true,
        queued: 0,
        running: 0,
      },
    ],
    worker: { available: true, heartbeat: null, active_run: null },
  }
}
