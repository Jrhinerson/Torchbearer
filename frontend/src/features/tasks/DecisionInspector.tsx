import { agentLabel } from './api'
import type { Routing, Run, Task, TaskFlowData } from './api'
import { taskApprovalLabel } from './workflowLabels'

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
  history,
  onInspectRun,
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
  history: TaskFlowData
  onInspectRun: (id: string | null) => void
}) {
  const evidence = run?.result.tests?.length
    ? run.result.tests
    : (run?.input_context?.artifacts?.implementation?.result.tests ?? [])
  const next = task.operations?.next_agent
  const decision =
    run?.result.artifacts?.decision ??
    run?.input_context?.artifacts?.implementation?.result.artifacts?.decision
  const recent = [
    ...history.runs.map((attempt) => ({
      id: `run-${attempt.id}`,
      runId: attempt.id,
      time: attempt.finished_at ?? attempt.started_at ?? attempt.created_at,
      label: `${agentLabel(attempt.agent, routing)} · ${attempt.stage.replaceAll('_', ' ')} · ${attempt.state}`,
    })),
    ...history.decisions.map((item) => ({
      id: `decision-${item.id}`,
      runId: (item as typeof item & { run?: string }).run ?? null,
      time: item.created_at,
      label: `You · ${item.action.replaceAll('_', ' ')}`,
    })),
  ]
    .sort((a, b) => b.time.localeCompare(a.time) || b.id.localeCompare(a.id))
    .slice(0, 5)
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
              {taskApprovalLabel(task)}
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
      {run?.result.workflow_steps && (
        <section aria-label="Procedure evidence">
          <h4>Procedure evidence</h4>
          <ul className="evidence-list">
            {run.result.workflow_steps.map((step) => (
              <li key={step.step_id}>
                <strong>
                  {task.workflow_snapshot.steps.find(
                    (entry) => entry.id === step.step_id,
                  )?.label ?? step.step_id}
                </strong>
                <span>{step.outcome.replaceAll('_', ' ')}</span>
                <p>{step.summary}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {decision && (
        <section aria-label="Decision artifact">
          <h4>Decision artifact</h4>
          <p>{decision.question}</p>
          <h4>Findings</h4>
          <ul>
            {decision.findings.map((finding, index) => (
              <li key={index}>
                {finding.summary}
                <br />
                <code>{finding.source}</code>
              </li>
            ))}
          </ul>
          <h4>Alternatives</h4>
          <ul>
            {decision.options.map((option, index) => (
              <li key={index}>
                <strong>{option.name}</strong>: {option.tradeoffs}
              </li>
            ))}
          </ul>
          <h4>Recommendation</h4>
          <p>{decision.recommendation}</p>
          <h4>Limitations</h4>
          <p>{decision.limitations}</p>
        </section>
      )}
      {error && (
        <p className="feedback feedback-error" role="alert">
          {error}
        </p>
      )}
      <section aria-label="Recent task activity">
        <h4>Recent activity</h4>
        <ol className="inspector-activity">
          {recent.map((item) => (
            <li key={item.id}>
              <button
                className="button button-link"
                type="button"
                onClick={() => onInspectRun(item.runId)}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ol>
      </section>
    </aside>
  )
}
