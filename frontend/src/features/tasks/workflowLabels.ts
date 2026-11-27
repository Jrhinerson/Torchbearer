import type { Run, Task } from './api'

export const stageLabels: Record<Task['status'] | Run['stage'], string> = {
  backlog: 'Backlog',
  refine: 'Refinement',
  plan: 'Plan',
  integrate: 'Integrate',
  test: 'Test (legacy)',
  code_review: 'Code Review',
  final_approval: 'Final Approval',
  retro: 'Retrospective',
}

export const approvalLabels: Partial<Record<Task['status'], string>> = {
  backlog: 'Start planning',
  plan: 'Approve plan & start Integrate',
  integrate: 'Approve implementation & start Code Review',
  code_review: 'Approve code review & continue',
  final_approval: 'Give final approval',
}

export function taskStageLabel(task: Task, stage: string): string {
  return (
    task.workflow_snapshot?.stage_labels?.[
      stage as keyof typeof task.workflow_snapshot.stage_labels
    ] ??
    stageLabels[stage as keyof typeof stageLabels] ??
    stage
  )
}

export function taskApprovalLabel(task: Task) {
  if (task.workflow_snapshot?.execution_mode === 'decision') {
    return {
      backlog: 'Start planning',
      plan: 'Approve plan & start investigation',
      integrate: 'Approve findings & start decision review',
      code_review: 'Approve decision review & continue',
      final_approval: 'Accept decision',
    }[task.status]
  }
  return approvalLabels[task.status]
}
