import type { Task } from './api'

export const stageLabels: Record<Task['status'], string> = {
  backlog: 'Backlog',
  plan: 'Plan',
  integrate: 'Integrate',
  test: 'Test',
  code_review: 'Code Review',
  final_approval: 'Final Approval',
}

export const approvalLabels: Partial<Record<Task['status'], string>> = {
  plan: 'Approve plan & start Integrate',
  integrate: 'Approve changes & start Test',
  test: 'Approve test & start Code Review',
  code_review: 'Approve code review & continue',
  final_approval: 'Give final approval',
}
