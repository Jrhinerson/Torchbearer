import type { Task } from './api'

const stages = [
  ['plan', 'Plan'],
  ['integrate', 'Work'],
  ['code_review', 'Review'],
  ['final_approval', 'Accept'],
] as const

export default function TaskRoute({ task }: { task: Task }) {
  return (
    <ol className="task-mini-route" aria-label="Expected task route">
      {stages.map(([id, label]) => (
        <li key={id} data-current={task.status === id}>
          <span className="route-mark" aria-hidden="true" />
          <span>{label}</span>
        </li>
      ))}
    </ol>
  )
}
