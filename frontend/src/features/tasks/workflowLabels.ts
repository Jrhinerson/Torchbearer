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
