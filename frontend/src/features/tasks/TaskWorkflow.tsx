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
import { WorkflowConversation } from './WorkflowConversation'
import { stageLabels } from './workflowLabels'

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
  onReview,
}: {
  task: Task
  repositories: Repository[]
  routing: Routing | null
  onTask: (task: Task) => void
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
      {task.status === 'backlog' ? (
        <>
          <button
            type="button"
            className="button button-secondary step-button"
            disabled={
              busy ||
              isActive(task) ||
              !task.repository ||
              !task.routing_mode ||
              Boolean(run && run.state !== 'succeeded')
            }
            onClick={() => void change(() => performAction(task, 'start'))}
          >
            {busy ? 'Starting…' : 'Start planning'}
          </button>
          {!run ? (
            <>
              <button
                type="button"
                className="button button-quiet step-button"
                disabled={busy || !task.repository || !task.routing_mode}
                onClick={() =>
                  void change(async () => {
                    const updated = await performAction(task, 'refine')
                    onReview()
                    return updated
                  })
                }
              >
                Refine task
              </button>
              <p className="workflow-hint">
                Optional: clarify the goal first. Starting refinement fixes this
                task's project and agent choices.
              </p>
            </>
          ) : (
            <>
              <p className={`run-state state-${run.state}`}>
                Refinement:{' '}
                {run.state === 'succeeded'
                  ? 'Ready to plan'
                  : states[run.state]}
              </p>
              <button
                className="button button-secondary step-button"
                onClick={onReview}
              >
                View refinement
              </button>
            </>
          )}
          {!task.routing_mode && (
            <p className="workflow-hint">
              Open the task title to choose routing.
            </p>
          )}
          {!task.repository && (
            <p className="workflow-hint">
              Open the task title to choose a repository.
            </p>
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

export function TaskSettingsDialog({
  task,
  repositories,
  routing,
  onTask,
  onAdded,
  onClose,
}: {
  task: Task
  repositories: Repository[]
  routing: Routing | null
  onTask: (task: Task) => void
  onAdded: (repository: Repository) => void
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const previous = document.activeElement
    dialog.current?.showModal()
    closeButton.current?.focus()
    return () => {
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [])

  async function chooseRepository(id: string) {
    if (!id) return
    setBusy(true)
    setError('')
    try {
      onTask(await updateTaskSettings(task, { repository: id }))
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not update task.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <dialog
      ref={dialog}
      className="surface surface-overlay task-dialog"
      aria-labelledby="task-settings-heading"
      onClose={onClose}
    >
      <div className="dialog-heading">
        <div>
          <p className="eyebrow">Task settings</p>
          <h2 id="task-settings-heading">{task.title}</h2>
        </div>
        <button
          ref={closeButton}
          type="button"
          className="button button-quiet button-icon close-dialog-button"
          aria-label="Close task settings"
          onClick={() => dialog.current?.close()}
        >
          ×
        </button>
      </div>
      <TaskRoutingEditor
        key={`${task.id}:${task.routing_mode}:${task.frontier_agent}`}
        task={task}
        routing={routing}
        disabled={busy || Boolean(task.latest_run)}
        onTask={onTask}
      />
      <RepositoryPicker
        repositories={repositories}
        value={task.repository ?? ''}
        onChange={(id) => void chooseRepository(id)}
        onAdded={onAdded}
        disabled={busy || Boolean(task.latest_run) || !task.routing_mode}
      />
      {error && (
        <p role="alert" className="feedback feedback-error form-error">
          {error}
        </p>
      )}
    </dialog>
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
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
  const acting = useRef(false)
  const run = history?.runs.find((item) => item.id === task.latest_run?.id)
  const active = isActive(task)
  const reviewCurrent = Boolean(
    run?.review_fingerprint &&
    workspace?.fingerprint === run.review_fingerprint,
  )
  const canApprove = Boolean(
    run &&
    task.routing_mode &&
    run.state === 'succeeded' &&
    run.result.outcome === 'complete' &&
    reviewCurrent &&
    !active &&
    !task.completed_at,
  )
  const next = task.status === 'backlog' ? 'plan' : task.next_stage
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

  async function act(action: TaskAction | 'cancel', message = '') {
    if (acting.current) return false
    acting.current = true
    setBusy(true)
    setError('')
    try {
      const updated =
        action === 'cancel'
          ? await cancelRun(task)
          : await performAction(task, action, run, message)
      onTask(updated)
      setReload((value) => value + 1)
      return true
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not update this task.',
      )
      setReload((value) => value + 1)
      return false
    } finally {
      acting.current = false
      setBusy(false)
    }
  }

  return (
    <dialog
      ref={dialog}
      className="surface surface-overlay task-dialog workflow-dialog planning-dialog"
      aria-labelledby="workflow-heading"
      onCancel={(event) => {
        if (busy) event.preventDefault()
      }}
      onClose={onClose}
    >
      <div className="dialog-heading">
        <div>
          <p className="planning-context">
            <span>{task.project?.name || 'Task'}</span>
            <span aria-hidden="true">/</span>
            <span>{stageLabels[task.status]}</span>
          </p>
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
      {!task.completed_at && !task.routing_mode && (
        <TaskRoutingEditor
          task={task}
          routing={routing}
          disabled={busy || active}
          onTask={onTask}
        />
      )}
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
        <WorkflowConversation
          key={
            task.id +
            ':' +
            task.status +
            ':' +
            (task.latest_run?.stage === 'retro' ? 'retro' : 'workflow')
          }
          task={task}
          history={history}
          run={run}
          routing={routing}
          active={active}
          busy={busy}
          error={error}
          workspace={workspace}
          workspaceError={workspaceError}
          canApprove={canApprove && !missingAgent}
          approvalHint={
            workspaceError ||
            (!reviewCurrent
              ? workspace
                ? 'Workspace changes have made this result stale. Request a new reply before approving.'
                : 'Checking the workspace before approval…'
              : missingAgent
                ? 'The agent for ' +
                  stageLabels[next!] +
                  ' must be configured and installed before continuing.'
                : '')
          }
          onMessage={(action, message) => act(action, message)}
          onRetry={() =>
            void act(
              run?.stage === 'refine' || run?.stage === 'retro'
                ? run.stage
                : 'retry',
            )
          }
          onStop={() => void act('cancel')}
          onRetrospective={() => void act('retro')}
          onApprove={() =>
            void act(
              task.status === 'backlog'
                ? 'start'
                : task.status === 'final_approval'
                  ? 'final_approve'
                  : 'approve',
            )
          }
        />
      )}
    </dialog>
  )
}
