import { agentLabel } from './api'
import type { Routing, Run, Task } from './api'
import { approvalLabels } from './workflowLabels'

export function DecisionInspector({
  task,
  run,
  routing,
  canApprove,
  approvalHint,
  busy,
  error,
  onApprove,
  onConversation,
  historical,
  onLatest,
}: {
  task: Task
  run: Run | undefined
  routing: Routing | null
  canApprove: boolean
  approvalHint: string
  busy: boolean
  error: string
  onApprove: () => void
  onConversation: () => void
  historical: boolean
  onLatest: () => void
}) {
  const evidence = run?.result.tests?.length
    ? run.result.tests
    : (run?.input_context?.artifacts?.implementation?.result.tests ?? [])
  const next = task.operations?.next_agent
  return (
    <aside
      className="decision-inspector"
      aria-label="Task evidence and actions"
    >
      <h3>
        {historical
          ? 'Historical attempt'
          : task.completed_at
            ? 'Accepted result'
            : task.operations?.group === 'needs_you'
              ? 'Decision required'
              : 'Execution details'}
      </h3>
      <p className="inspector-title">{task.title}</p>
      <p className="task-operation-state">
        {historical
          ? `Attempt ${run?.sequence} · ${run?.stage}`
          : task.operations?.reason}
      </p>
      {run?.result.summary && <p>{run.result.summary}</p>}
      <section aria-label="Validation evidence">
        <h4>Evidence</h4>
        {evidence.length ? (
          <ul className="evidence-list">
            {evidence.map((check, index) => (
              <li key={index} data-outcome={check.outcome}>
                <span>
                  {check.outcome === 'pass'
                    ? '✓'
                    : check.outcome === 'fail'
                      ? '×'
                      : '○'}{' '}
                  {check.outcome.replaceAll('_', ' ')}
                </span>
                <code>{check.command}</code>
                <details>
                  <summary>Command report</summary>
                  <p>{check.details}</p>
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <p className="workflow-hint">
            No validation commands reported for this attempt.
          </p>
        )}
        {run && (
          <p className="workflow-hint">
            Source: attempt {run.sequence} · {agentLabel(run.agent, routing)}
          </p>
        )}
      </section>
      {!historical && !task.completed_at && (
        <section>
          <h4>Next handoff</h4>
          <p>
            {run ? agentLabel(run.agent, routing) : 'Agent'} → You
            {next ? ` → ${agentLabel(next, routing)}` : ''}
          </p>
        </section>
      )}
      {historical ? (
        <button className="button button-secondary" onClick={onLatest}>
          Return to latest attempt
        </button>
      ) : (
        <>
          {run?.state === 'succeeded' && !task.completed_at && (
            <button
              className="button button-primary"
              disabled={busy || !canApprove}
              onClick={onApprove}
            >
              {approvalLabels[task.status]}
            </button>
          )}
          {approvalHint && !task.completed_at && (
            <p className="workflow-hint">{approvalHint}</p>
          )}
          <button className="button button-secondary" onClick={onConversation}>
            {task.completed_at
              ? 'View conversation'
              : 'Conversation & revision'}
          </button>
        </>
      )}
      {error && (
        <p className="feedback feedback-error" role="alert">
          {error}
        </p>
      )}
    </aside>
  )
}
