import { useEffect, useRef, useState } from 'react'
import {
  agentLabel,
  cancelRun,
  getRuns,
  getWorkspace,
  performAction,
  updateTaskSettings,
} from './api'
import type {
  Repository,
  Routing,
  RunHistory,
  RunState,
  Task,
  TaskAction,
  WorkspaceChanges,
} from './api'
import { RepositoryPicker } from './RepositoryPicker'
import { TaskRoutingEditor } from './TaskRouting'

const states: Record<RunState, string> = {
  queued: 'Queued',
  running: 'Running',
  succeeded: 'Awaiting review',
  blocked: 'Blocked',
  failed: 'Failed',
  cancelled: 'Cancelled',
  interrupted: 'Interrupted',
}
const isActive = (task: Task) =>
  task.latest_run?.state === 'queued' || task.latest_run?.state === 'running'

export function CardWorkflow({
  task,
  repositories,
  routing,
  onTask,
  onAdded,
  onReview,
}: {
  task: Task
  repositories: Repository[]
  routing: Routing | null
  onTask: (task: Task) => void
  onAdded: (repository: Repository) => void
  onReview: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = task.latest_run
  const repository = repositories.find((item) => item.id === task.repository)
  async function change(operation: () => Promise<Task>) {
    setBusy(true)
    setError('')
    try {
      onTask(await operation())
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not update task.',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="card-workflow">
      <p className="workflow-hint">
        {routing?.approaches.find((mode) => mode.id === task.routing_mode)
          ?.label ?? 'Routing needed'}
        {task.frontier_agent
          ? ` - ${agentLabel(task.frontier_agent, routing)}`
          : ''}
      </p>
      {!task.completed_at &&
        (task.status === 'backlog' || !task.routing_mode) && (
          <TaskRoutingEditor
            key={`${task.id}:${task.routing_mode}:${task.frontier_agent}`}
            task={task}
            routing={routing}
            disabled={busy || isActive(task)}
            onTask={onTask}
          />
        )}

      {task.status === 'backlog' ? (
        <>
          <RepositoryPicker
            repositories={repositories}
            value={task.repository ?? ''}
            onChange={(id) => {
              if (id)
                void change(() => updateTaskSettings(task, { repository: id }))
            }}
            onAdded={onAdded}
            disabled={busy || !task.routing_mode}
          />
          <button
            type="button"
            className="button button-secondary step-button"
            disabled={busy || !task.repository || !task.routing_mode}
            onClick={() => void change(() => performAction(task, 'start'))}
          >
            {busy ? 'Starting…' : 'Start planning'}
          </button>
          {!task.routing_mode && (
            <p className="workflow-hint">Choose task routing to begin.</p>
          )}
        </>
      ) : (
        <>
          <p className="repository-name" title={repository?.path}>
            {repository?.name}
          </p>
          <p
            className={`run-state state-${task.completed_at ? 'approved' : run?.state}`}
          >
            {task.completed_at
              ? 'Approved'
              : task.status === 'final_approval'
                ? 'Awaiting final approval'
                : run
                  ? states[run.state]
                  : 'Ready'}
            {run && (
              <span>
                {agentLabel(run.agent, routing)} · Run {run.sequence}
              </span>
            )}
          </p>
          {run?.error && (
            <p className="feedback feedback-error form-error">{run.error}</p>
          )}
          <button
            type="button"
            className="button button-secondary step-button"
            onClick={onReview}
          >
            {task.completed_at
              ? 'View history'
              : isActive(task)
                ? 'View run'
                : 'Review step'}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="feedback feedback-error form-error">
          {error}
        </p>
      )}
    </div>
  )
}

export function WorkflowDialog({
  task,
  onTask,
  onClose,
  routing,
}: {
  task: Task
  onTask: (task: Task) => void
  onClose: () => void
  routing: Routing | null
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const [history, setHistory] = useState<RunHistory | null>(null)
  const [workspace, setWorkspace] = useState<WorkspaceChanges | null>(null)
  const [workspaceError, setWorkspaceError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [selectedRun, setSelectedRun] = useState('')
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
  const run = history?.runs.find(
    (item) => item.id === (selectedRun || task.latest_run?.id),
  )
  const latest = Boolean(run && run.id === task.latest_run?.id)
  const active = isActive(task)
  const reviewCurrent = Boolean(
    run?.review_fingerprint &&
    workspace?.fingerprint === run.review_fingerprint,
  )
  const canApprove =
    latest &&
    Boolean(task.routing_mode) &&
    run?.state === 'succeeded' &&
    reviewCurrent &&
    !active &&
    !task.completed_at
  const next = task.next_stage
  const missingAgent =
    next &&
    next !== 'final_approval' &&
    (!task.stage_agents[next] ||
      routing?.agents.find((agent) => agent.id === task.stage_agents[next])
        ?.available === false)

  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    dialog.current?.showModal()
    closeButton.current?.focus()
    return () => {
      previous?.focus()
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    async function load() {
      try {
        const result = await getRuns(task.id, controller.signal)
        if (controller.signal.aborted) return
        setHistory(result)
        setLoadError('')
        if (task.workspace_path && !active) {
          try {
            const snapshot = await getWorkspace(task.id, controller.signal)
            if (!controller.signal.aborted) {
              setWorkspace(snapshot)
              setWorkspaceError('')
            }
          } catch (cause) {
            if (!controller.signal.aborted) {
              setWorkspace(null)
              setWorkspaceError(
                cause instanceof Error
                  ? cause.message
                  : 'Could not load code changes.',
              )
            }
          }
        } else {
          setWorkspace(null)
        }
      } catch (cause) {
        if (!controller.signal.aborted)
          setLoadError(
            cause instanceof Error ? cause.message : 'Could not load runs.',
          )
      } finally {
        if (!controller.signal.aborted)
          timer = setTimeout(() => void load(), 2000)
      }
    }
    void load()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [
    task.id,
    task.latest_run?.id,
    task.latest_run?.state,
    task.workspace_path,
    active,
    reload,
  ])

  async function act(action: TaskAction | 'cancel') {
    setBusy(true)
    setError('')
    try {
      const updated =
        action === 'cancel'
          ? await cancelRun(task)
          : await performAction(task, action, run, feedback)
      onTask(updated)
      setFeedback('')
      setSelectedRun('')
      setReload((value) => value + 1)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not update this task.',
      )
      setReload((value) => value + 1)
    } finally {
      setBusy(false)
    }
  }

  return (
    <dialog
      ref={dialog}
      className="surface surface-overlay task-dialog workflow-dialog"
      aria-labelledby="workflow-heading"
      onCancel={(event) => {
        if (busy) event.preventDefault()
      }}
      onClose={onClose}
    >
      <div className="dialog-heading">
        <div>
          <p className="eyebrow">{task.status.replace('_', ' ')}</p>
          <h2 id="workflow-heading">{task.title}</h2>
        </div>
        <button
          ref={closeButton}
          type="button"
          className="button button-quiet button-icon close-dialog-button"
          aria-label="Close task review"
          disabled={busy}
          onClick={() => dialog.current?.close()}
        >
          ×
        </button>
      </div>
      {task.completed_at && (
        <p className="run-state state-approved">
          Approved · {new Date(task.completed_at).toLocaleString()}
        </p>
      )}
      <p className="workflow-hint">
        {task.branch}
        <br />
        <span className="workspace-path">
          {task.workspace_path || 'Preparing workspace…'}
        </span>
      </p>
      {loadError && (
        <p role="alert" className="feedback feedback-error form-error">
          {loadError}{' '}
          <button
            className="button button-link"
            onClick={() => setReload((value) => value + 1)}
          >
            Reload runs
          </button>
        </p>
      )}
      {!history && !loadError && <p role="status">Loading runs…</p>}
      {history && (
        <>
          <label className="field-label" htmlFor="run-history">
            Run history
          </label>
          <select
            className="field"
            id="run-history"
            value={selectedRun || task.latest_run?.id || ''}
            onChange={(event) => setSelectedRun(event.target.value)}
          >
            {history.runs.map((attempt) => (
              <option key={attempt.id} value={attempt.id}>
                Run {attempt.sequence} · {attempt.stage} ·{' '}
                {agentLabel(attempt.agent, routing)} · {states[attempt.state]}
              </option>
            ))}
          </select>
          {run && (
            <div className="run-review">
              <p className={`run-state state-${run.state}`}>
                {states[run.state]}{' '}
                <span>
                  {agentLabel(run.agent, routing)} {run.cli_version}
                </span>
              </p>
              {run.error && (
                <p role="alert" className="feedback feedback-error form-error">
                  {run.error}
                </p>
              )}
              {run.result.summary && <h3>{run.result.summary}</h3>}
              {run.result.details && (
                <pre className="stage-result">{run.result.details}</pre>
              )}
              {Boolean(run.result.tests?.length) && (
                <ul className="test-report">
                  {run.result.tests!.map((test, index) => (
                    <li key={index}>
                      <strong>{test.outcome}</strong>{' '}
                      <code>{test.command}</code>
                      <p>{test.details}</p>
                    </li>
                  ))}
                </ul>
              )}
              <details>
                <summary>Execution log</summary>
                <pre className="run-log">
                  {run.log || 'Waiting for output…'}
                </pre>
              </details>
              {!active && (
                <details>
                  <summary>Current code changes</summary>
                  {workspaceError ? (
                    <p
                      role="alert"
                      className="feedback feedback-error form-error"
                    >
                      {workspaceError}
                    </p>
                  ) : workspace ? (
                    <>
                      <pre className="run-log">
                        {workspace.diff || 'No code changes.'}
                      </pre>
                      {workspace.truncated && (
                        <p className="workflow-hint">
                          Preview truncated. Review the full diff in the task
                          worktree.
                        </p>
                      )}
                    </>
                  ) : (
                    <p role="status">Loading code changes…</p>
                  )}
                </details>
              )}
              {latest && !task.completed_at && (
                <div className="review-actions">
                  {active ? (
                    <button
                      className="button button-secondary"
                      type="button"
                      disabled={
                        busy || Boolean(task.latest_run?.cancel_requested)
                      }
                      onClick={() => void act('cancel')}
                    >
                      {task.latest_run?.cancel_requested
                        ? 'Cancelling…'
                        : 'Cancel run'}
                    </button>
                  ) : (
                    <>
                      {run.state === 'succeeded' && !reviewCurrent && (
                        <p className="workflow-hint">
                          {workspace
                            ? 'Workspace changes have made this result stale. Request a new run before approving.'
                            : 'Code changes must load before you can approve.'}
                        </p>
                      )}
                      {missingAgent && (
                        <p className="workflow-hint">
                          The agent for {next} must be configured and installed
                          before continuing.
                        </p>
                      )}
                      <div className="review-primary-actions">
                        {run.state === 'succeeded' && (
                          <button
                            type="button"
                            className="button button-primary"
                            disabled={
                              busy || !canApprove || Boolean(missingAgent)
                            }
                            onClick={() =>
                              void act(
                                task.status === 'final_approval'
                                  ? 'final_approve'
                                  : 'approve',
                              )
                            }
                          >
                            {task.status === 'final_approval'
                              ? 'Give final approval'
                              : task.status === 'plan'
                                ? 'Approve plan & start Integrate'
                                : task.status === 'integrate'
                                  ? 'Approve changes & start Test'
                                  : task.status === 'test'
                                    ? 'Approve test & start Code Review'
                                    : 'Approve code review & continue'}
                          </button>
                        )}
                        {run.state !== 'succeeded' &&
                          task.status !== 'final_approval' && (
                            <button
                              type="button"
                              className="button button-secondary"
                              disabled={busy || !task.routing_mode}
                              onClick={() => void act('retry')}
                            >
                              Retry step
                            </button>
                          )}
                      </div>
                      <label className="field-label" htmlFor="review-feedback">
                        Revision or rework instructions
                      </label>
                      <textarea
                        className="field"
                        id="review-feedback"
                        value={feedback}
                        onChange={(event) => setFeedback(event.target.value)}
                        maxLength={4000}
                        rows={3}
                        disabled={busy || !task.routing_mode}
                        placeholder="Describe what needs to change…"
                      />
                      <div className="review-secondary-actions">
                        {task.status !== 'final_approval' && (
                          <button
                            type="button"
                            className="button button-secondary"
                            disabled={busy || !feedback.trim()}
                            onClick={() => void act('revise')}
                          >
                            Request revision
                          </button>
                        )}
                        {task.status !== 'plan' && (
                          <button
                            type="button"
                            className="button button-secondary"
                            disabled={busy || !feedback.trim()}
                            onClick={() => void act('send_back')}
                          >
                            {task.status === 'integrate'
                              ? 'Send back to Plan'
                              : 'Send back to Integrate'}
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
          {history.decisions.length > 0 && (
            <details className="decision-history">
              <summary>Human decisions</summary>
              <ol>
                {history.decisions.map((decision) => (
                  <li key={decision.id}>
                    <strong>{decision.action.replaceAll('_', ' ')}</strong> ·{' '}
                    {decision.from_stage} → {decision.to_stage}
                    <time dateTime={decision.created_at}>
                      {new Date(decision.created_at).toLocaleString()}
                    </time>
                    {decision.feedback && <p>{decision.feedback}</p>}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="feedback feedback-error form-error">
          {error}
        </p>
      )}
    </dialog>
  )
}
