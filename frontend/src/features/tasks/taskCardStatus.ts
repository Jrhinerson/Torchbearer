import type { Agent, Task } from './api'

const labels = {
  ready: 'Ready',
  routing_needed: 'Routing needed',
  queued: 'Queued',
  running: 'Running',
  succeeded: 'Awaiting review',
  blocked: 'Blocked — human input needed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  interrupted: 'Interrupted',
  final_approval: 'Awaiting final approval',
  approved: 'Approved',
}

function responsibleAgent(task: Task): Agent | null {
  if (task.status === 'backlog' && task.latest_run?.stage === 'refine')
    return task.latest_run.agent
  if (task.status === 'backlog') return task.stage_agents.plan ?? null
  if (task.status === 'final_approval')
    return task.latest_run?.agent ?? task.stage_agents.code_review ?? null
  if (task.latest_run?.stage === task.status) return task.latest_run.agent
  return task.stage_agents[task.status] ?? null
}

export function taskCardStatus(task: Task) {
  // A previous stage's result must not animate the stage receiving the handoff.
  const run =
    task.latest_run?.stage === task.status ||
    (task.status === 'backlog' && task.latest_run?.stage === 'refine')
      ? task.latest_run
      : null
  const state = task.completed_at
    ? 'approved'
    : task.status === 'backlog'
      ? (run?.state ?? (task.routing_mode ? 'ready' : 'routing_needed'))
      : task.status === 'final_approval'
        ? 'final_approval'
        : (run?.state ?? 'ready')
  const activity =
    state === 'running'
      ? 'running'
      : state === 'succeeded' ||
          state === 'blocked' ||
          state === 'final_approval'
        ? 'awaiting-input'
        : 'idle'

  return {
    agent: responsibleAgent(task),
    activity,
    label: labels[state],
  }
}
