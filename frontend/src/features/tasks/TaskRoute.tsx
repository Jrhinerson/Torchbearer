import type { Task } from './api'

const stages = [
  ['plan', 'Plan'],
  ['integrate', 'Work'],
  ['code_review', 'Review'],
  ['final_approval', 'Accept'],
] as const

const shortLabels: Record<string, string> = {
  scope: 'Scope',
  implement: 'Build',
  validate: 'Verify',
  review: 'Review',
  spec: 'Spec',
  slices: 'Build',
  contracts: 'Contract',
  examples: 'Examples',
  red: 'Test',
  green: 'Build',
  refactor: 'Refactor',
  diagnose: 'Diagnose',
  reproduce: 'Reproduce',
  fix: 'Fix',
  regress: 'Verify',
  baseline: 'Baseline',
  question: 'Question',
  investigate: 'Investigate',
  compare: 'Compare',
  recommend: 'Decide',
}

export default function TaskRoute({ task }: { task: Task }) {
  const steps = task.workflow_snapshot?.steps?.length
    ? task.workflow_snapshot.steps.map(
        (step) => [step.stage, step.label, step.id] as const,
      )
    : stages.map(([id, label]) => [id, label, id] as const)
  return (
    <ol className="task-mini-route" aria-label="Expected task route">
      {steps.map(([id, label, key]) => (
        <li
          key={key}
          data-current={task.status === id}
          title={
            task.status === id
              ? `${label}: part of the current stage; individual progress is shown in Flow.`
              : `${label}: expected procedure step`
          }
        >
          <span className="route-mark" aria-hidden="true" />
          <span aria-label={label}>
            {shortLabels[key] ?? label.split(' ')[0]}
          </span>
        </li>
      ))}
    </ol>
  )
}
