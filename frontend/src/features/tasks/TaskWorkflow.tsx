import { useEffect, useRef, useState } from 'react'
import {
  agentLabel,
  cancelRun,
  getTaskFlowUpdate,
  getWorkspace,
  getWorkspaceFingerprint,
  performAction,
  updateTaskSettings,
} from './api'
import type {
  Repository,
  Routing,
  TaskFlowData,
  RunState,
  Task,
  TaskAction,
  WorkspaceChanges,
} from './api'
import { RepositoryPicker } from './RepositoryPicker'
import { TaskRoutingEditor } from './TaskRouting'
import { WorkflowConversation } from './WorkflowConversation'
import { taskStageLabel } from './workflowLabels'
import { TaskFlow } from './TaskFlow'
import { DecisionInspector } from './DecisionInspector'
import { TaskWorkflowEditor } from './WorkflowChoice'

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
      <TaskWorkflowEditor task={task} onTask={onTask} />
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
  embedded = false,
  refreshToken,
  selectedRunId,
  onInspectRun,
}: {
  task: Task
  onTask: (task: Task) => void
  onClose: () => void
  routing: Routing | null
  embedded?: boolean
  refreshToken?: string
  selectedRunId?: string | null
  onInspectRun?: (id: string | null) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const suppressedCloseEvents = useRef(0)
  const closeButton = useRef<HTMLButtonElement>(null)
  const [history, setHistory] = useState<TaskFlowData | null>(null)
  const flowEtag = useRef<string | undefined>(undefined)
  const workspaceCache = useRef<WorkspaceChanges | null>(null)
  const diffFingerprint = useRef<string | null>(null)
  const [workspace, setWorkspace] = useState<WorkspaceChanges | null>(null)
  const [workspaceError, setWorkspaceError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
  const [tab, setTab] = useState<'flow' | 'conversation' | 'changes'>(
    embedded ? 'flow' : 'conversation',
  )
  const [focused, setFocused] = useState(false)
  const [focusComposer, setFocusComposer] = useState(0)
  const [localInspectedRunId, setLocalInspectedRunId] = useState<string | null>(
    null,
  )
  const inspectedRunId =
    selectedRunId === undefined ? localInspectedRunId : selectedRunId
  const setInspectedRunId = onInspectRun ?? setLocalInspectedRunId
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
    !task.completed_at &&
    !loadError &&
    !history?.read_only &&
    history?.revision === task.revision &&
    history?.latest_run_id === task.latest_run?.id,
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
    return () => {
      previous?.focus()
    }
  }, [])

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (element.open) {
      suppressedCloseEvents.current++
      element.close()
    }
    if (!embedded || focused) {
      element.showModal()
      closeButton.current?.focus()
    } else element.show()
  }, [embedded, focused])

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    async function load() {
      try {
        const update = await getTaskFlowUpdate(
          task.id,
          controller.signal,
          flowEtag.current,
        )
        if (controller.signal.aborted) return
        flowEtag.current = update.etag ?? undefined
        if (update.data) {
          setHistory(update.data)
          if (update.data.revision > task.revision) onTask(update.data.task)
        }
        setLoadError('')
        if (task.workspace_path && !active) {
          try {
            const current = await getWorkspaceFingerprint(
              task.id,
              controller.signal,
            )
            if (controller.signal.aborted) return
            let snapshot = workspaceCache.current
            if (!snapshot || snapshot.fingerprint !== current.fingerprint) {
              snapshot = {
                preview_loaded: false,
                fingerprint: current.fingerprint,
                diff: '',
                truncated: false,
              }
              diffFingerprint.current = null
            }
            if (
              (!embedded || tab !== 'flow') &&
              diffFingerprint.current !== current.fingerprint
            ) {
              snapshot = await getWorkspace(task.id, controller.signal)
              if (controller.signal.aborted) return
              diffFingerprint.current = snapshot.fingerprint
            }
            if (!controller.signal.aborted) {
              workspaceCache.current = snapshot
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
          if (!embedded) timer = setTimeout(() => void load(), 2000)
      }
    }
    void load()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [
    task.id,
    task.revision,
    onTask,
    refreshToken,
    embedded,
    task.latest_run?.id,
    task.latest_run?.state,
    task.workspace_path,
    active,
    reload,
    tab,
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
      className={`surface surface-overlay task-dialog workflow-dialog planning-dialog ${embedded && !focused ? 'embedded-workspace' : ''}`}
      aria-labelledby="workflow-heading"
      onCancel={(event) => {
        if (busy) event.preventDefault()
      }}
      onClose={() => {
        if (suppressedCloseEvents.current) suppressedCloseEvents.current--
        else onClose()
      }}
    >
      <div className="dialog-heading">
        <div>
          <p className="planning-context">
            <span>{task.project?.name || 'Task'}</span>
            <span aria-hidden="true">/</span>
            <span>{taskStageLabel(task, task.status)}</span>
          </p>
          <h2 id="workflow-heading">{task.title}</h2>
          <p className="workflow-hint">
            {task.workflow_snapshot?.name ?? 'Legacy engineering workflow'} ·
            Workflow fixed when agent work started
          </p>
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
      {embedded && (
        <div className="workspace-tabs" role="tablist" aria-label="Task views">
          {(['flow', 'conversation', 'changes'] as const).map((view) => (
            <button
              className="button button-quiet"
              type="button"
              role="tab"
              aria-selected={tab === view}
              key={view}
              onClick={() => setTab(view)}
            >
              {view[0].toUpperCase() + view.slice(1)}
            </button>
          ))}
          <button
            className="button button-secondary workspace-focus"
            type="button"
            onClick={() => setFocused(!focused)}
          >
            {focused ? 'Return to board' : 'Focus workspace'}
          </button>
        </div>
      )}
      <div className={embedded ? 'selected-task-layout' : undefined}>
        <div className="selected-task-content">
          {history && embedded && (
            <div hidden={tab !== 'flow'} role="tabpanel" aria-label="Flow">
              <TaskFlow
                flow={history}
                routing={routing}
                onRun={setInspectedRunId}
              />
            </div>
          )}
          {embedded && (
            <div
              hidden={tab !== 'changes'}
              role="tabpanel"
              aria-label="Changes"
            >
              <h3>Current workspace changes</h3>
              {workspaceError ? (
                <p role="alert">{workspaceError}</p>
              ) : workspace && workspace.preview_loaded !== false ? (
                <>
                  <pre className="run-log">
                    {workspace.diff || 'No code changes.'}
                  </pre>
                  {workspace.truncated && (
                    <p>
                      Preview truncated. Review the full diff in the task
                      worktree.
                    </p>
                  )}
                </>
              ) : (
                <p>
                  {active
                    ? 'Changes are available after the current attempt finishes.'
                    : task.workspace_path
                      ? 'Loading code changes…'
                      : 'No task workspace is available.'}
                </p>
              )}
            </div>
          )}
          <div
            hidden={embedded && tab !== 'conversation'}
            role={embedded ? 'tabpanel' : undefined}
            aria-label={embedded ? 'Conversation' : undefined}
          >
            {history && (
              <WorkflowConversation
                key={
                  task.id +
                  ':' +
                  task.status +
                  ':' +
                  (task.latest_run?.stage === 'retro' ? 'retro' : 'workflow')
                }
                showApproval={!embedded || focused}
                focusRequest={focusComposer}
                task={task}
                history={history}
                run={run}
                routing={routing}
                active={active}
                busy={busy}
                error={error}
                workspace={
                  workspace?.preview_loaded === false ? null : workspace
                }
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
                        taskStageLabel(task, next!) +
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
          </div>
        </div>
        {embedded && history && (
          <DecisionInspector
            task={task}
            history={history}
            onInspectRun={setInspectedRunId}
            run={
              history.runs.find((attempt) => attempt.id === inspectedRunId) ??
              run
            }
            routing={routing}
            historical={Boolean(inspectedRunId && inspectedRunId !== run?.id)}
            onLatest={() => setInspectedRunId(null)}
            canApprove={canApprove && !missingAgent}
            approvalHint={
              workspaceError ||
              (!reviewCurrent
                ? 'Review is unavailable until the current workspace matches this result.'
                : missingAgent
                  ? 'Install the next agent before continuing.'
                  : '')
            }
            busy={busy}
            actionsCurrent={
              !history.read_only &&
              !loadError &&
              history.revision === task.revision &&
              history.latest_run_id === task.latest_run?.id
            }
            onAction={(descriptor) => {
              if (
                descriptor.action === 'settings' ||
                descriptor.label === 'Answer question'
              ) {
                setTab('conversation')
                setFocusComposer((value) => value + 1)
              } else void act(descriptor.action)
            }}
            error={error}
            onConversation={() => {
              setTab('conversation')
              setFocusComposer((value) => value + 1)
            }}
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
      </div>
    </dialog>
  )
}
