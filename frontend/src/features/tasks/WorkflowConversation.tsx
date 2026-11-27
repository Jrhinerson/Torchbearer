import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { agentLabel } from './api'
import type {
  Routing,
  Run,
  RunHistory,
  Stage,
  SupportStage,
  Task,
  WorkspaceChanges,
} from './api'
import { PlanningMessage } from './PlanningMessage'
import {
  stageLabels,
  taskStageLabel,
  taskApprovalLabel,
} from './workflowLabels'

type MessageAction = 'plan_message' | 'revise' | 'send_back' | SupportStage

export function WorkflowConversation({
  task,
  history,
  run,
  routing,
  active,
  busy,
  canApprove,
  approvalHint,
  error,
  workspace,
  workspaceError,
  onMessage,
  onRetry,
  onStop,
  onApprove,
  onRetrospective,
  showApproval = true,
}: {
  task: Task
  showApproval?: boolean
  history: RunHistory
  run: Run | undefined
  routing: Routing | null
  active: boolean
  busy: boolean
  canApprove: boolean
  approvalHint: string
  error: string
  workspace: WorkspaceChanges | null
  workspaceError: string
  onMessage: (action: MessageAction, message: string) => Promise<boolean>
  onRetry: () => void
  onStop: () => void
  onApprove: () => void
  onRetrospective: () => void
}) {
  const planning = task.status === 'plan'
  const completed = Boolean(task.completed_at)
  const refining = task.status === 'backlog'
  const retrospective = completed && task.latest_run?.stage === 'retro'
  const support = refining || retrospective
  const readOnly = completed && !retrospective
  const finalReview = task.status === 'final_approval' && !retrospective
  const currentStage = refining
    ? 'refine'
    : retrospective
      ? 'retro'
      : task.status
  const [draft, setDraft] = useState('')
  const [action, setAction] = useState<MessageAction>(
    refining
      ? 'refine'
      : retrospective
        ? 'retro'
        : planning
          ? 'plan_message'
          : finalReview
            ? 'send_back'
            : 'revise',
  )
  const submitting = useRef(false)
  const thread = useRef<HTMLOListElement>(null)
  const composer = useRef<HTMLTextAreaElement>(null)
  const followReplies = useRef(true)
  const [following, setFollowing] = useState(true)
  const attempts = [...history.runs].sort((a, b) => a.sequence - b.sequence)
  const returnStage = task.status === 'integrate' ? 'plan' : 'integrate'
  const target = (action === 'send_back' ? returnStage : currentStage) as
    Stage | SupportStage
  const agent = task.stage_agents[target]
  const name = agent ? agentLabel(agent, routing) : 'Agent'
  const unavailable = Boolean(
    agent &&
    routing?.agents.find((entry) => entry.id === agent)?.available === false,
  )
  const canSend = Boolean(
    run &&
    task.routing_mode &&
    agent &&
    !unavailable &&
    !active &&
    !busy &&
    !readOnly,
  )
  const ready = run?.state === 'succeeded'
  const retryable =
    run &&
    (support || !ready) &&
    !finalReview &&
    (!planning ||
      ['failed', 'cancelled', 'interrupted'].includes(run.state) ||
      (run.state === 'blocked' && !run.result.summary && !run.result.details))
  const sendLabel = refining
    ? 'Send answers'
    : retrospective
      ? 'Send retrospective feedback'
      : planning
        ? 'Send message'
        : action === 'send_back'
          ? 'Send back to ' + taskStageLabel(task, returnStage)
          : 'Request revision'
  const inputLabel = refining
    ? 'Refinement answers or instructions'
    : retrospective
      ? 'Retrospective focus or feedback'
      : planning
        ? 'Message your planning agent'
        : 'Revision or rework instructions'
  const consequence = support
    ? refining
      ? 'Refinement keeps this task in Backlog'
      : 'Retrospectives preserve final approval'
    : planning
      ? 'Approve before implementation'
      : action === 'send_back'
        ? 'Sending returns the task to ' + taskStageLabel(task, returnStage)
        : 'Sending reruns ' + taskStageLabel(task, task.status)

  useEffect(() => {
    if (followReplies.current && thread.current)
      thread.current.scrollTop = thread.current.scrollHeight
  }, [task.latest_run?.id, task.latest_run?.state, history.runs])

  useLayoutEffect(() => {
    const element = composer.current
    if (!element) return
    function resize() {
      element!.style.height = 'auto'
      element!.style.height = String(element!.scrollHeight) + 'px'
      if (followReplies.current && thread.current)
        thread.current.scrollTop = thread.current.scrollHeight
    }
    resize()
    let width = element.getBoundingClientRect().width
    let frame = 0
    const observer = new ResizeObserver(() => {
      const currentWidth = element.getBoundingClientRect().width
      if (width !== currentWidth) {
        width = currentWidth
        cancelAnimationFrame(frame)
        frame = requestAnimationFrame(resize)
      }
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [draft, readOnly])

  function jumpToLatest() {
    followReplies.current = true
    setFollowing(true)
    if (thread.current) thread.current.scrollTop = thread.current.scrollHeight
  }

  async function send() {
    const message = draft.trim()
    if (!canSend || !message || submitting.current) return
    submitting.current = true
    jumpToLatest()
    try {
      if (await onMessage(action, message)) setDraft('')
    } finally {
      submitting.current = false
      composer.current?.focus()
    }
  }

  return (
    <section
      className="planning-conversation"
      aria-label={taskStageLabel(task, currentStage) + ' conversation'}
    >
      <div className="planning-thread">
        <ol
          ref={thread}
          className="planning-messages"
          aria-label={planning ? 'Planning conversation' : 'Task conversation'}
          tabIndex={0}
          onScroll={() => {
            const element = thread.current!
            followReplies.current =
              element.scrollHeight - element.scrollTop - element.clientHeight <
              60
            setFollowing(followReplies.current)
          }}
        >
          <li className="planning-message planning-message-user">
            <span className="sr-only">You</span>
            {task.description && task.description !== task.title && (
              <p className="planning-message-summary">{task.title}</p>
            )}
            <div className="planning-message-text">
              {task.description || task.title}
            </div>
          </li>
          {attempts.map((attempt, index) => (
            <Fragment key={attempt.id}>
              {index > 0 && attempts[index - 1].stage !== attempt.stage && (
                <li className="workflow-stage-marker">
                  <span>{taskStageLabel(task, attempt.stage)}</span>
                </li>
              )}
              <ConversationTurn
                run={attempt}
                routing={routing}
                current={attempt.id === task.latest_run?.id}
              />
            </Fragment>
          ))}
          {active && (
            <li className="planning-message planning-message-agent">
              <p role="status" className="planning-reply-status">
                <span className="planning-thinking-dot" aria-hidden="true" />
                {task.latest_run?.cancel_requested
                  ? 'Stopping reply…'
                  : task.latest_run?.state === 'queued'
                    ? 'Waiting to reply…'
                    : 'Thinking…'}
              </p>
            </li>
          )}
          {finalReview && (
            <li className="workflow-stage-marker">
              <span>Final Approval · Human review</span>
            </li>
          )}
          {finalReview && run?.stage === 'code_review' && (
            <li className="workflow-evidence">
              <section aria-label="Final approval brief">
                <h3>{run.result.summary}</h3>
                {run.input_context?.artifacts?.implementation?.result
                  .summary && (
                  <p>
                    {run.input_context.artifacts.implementation.result.summary}
                  </p>
                )}
                <p className="workflow-hint">
                  Review the delivered behavior, how to try it, validation
                  evidence, and remaining risks before approving.
                </p>
              </section>
            </li>
          )}
          {!planning && !active && (
            <li className="workflow-evidence">
              <details>
                <summary>Current code changes</summary>
                <p className="workflow-hint">
                  {task.branch}
                  <br />
                  <span className="workspace-path">
                    {task.workspace_path || 'Workspace not available.'}
                  </span>
                </p>
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
            </li>
          )}
          {!planning && history.decisions.length > 0 && (
            <li className="workflow-evidence">
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
            </li>
          )}
        </ol>
        {!following && (
          <button
            className="button button-secondary planning-jump"
            type="button"
            onClick={jumpToLatest}
          >
            <svg aria-hidden="true" viewBox="0 0 20 20">
              <path d="M10 3v14m-5-5 5 5 5-5" />
            </svg>
            Jump to latest
          </button>
        )}
      </div>
      <div className="planning-footer">
        {completed && (
          <p className="run-state state-approved workflow-completed">
            Approved · {new Date(task.completed_at!).toLocaleString()}
            <span>
              This task is complete. Its conversation and review history are
              preserved.
            </span>
          </p>
        )}
        {readOnly ? (
          <button
            type="button"
            className="button button-secondary"
            disabled={busy || active || !run || !task.routing_mode}
            onClick={onRetrospective}
          >
            Run retrospective
          </button>
        ) : (
          <>
            {showApproval && ready && !active && !retrospective && (
              <div className="planning-approval">
                <div>
                  <p className="planning-message-summary">
                    {finalReview
                      ? 'Ready for final approval'
                      : taskStageLabel(task, currentStage) +
                        ' ready for review'}
                  </p>
                  <p className="workflow-hint">
                    {approvalHint ||
                      (refining
                        ? 'Review the settled decisions before starting Plan.'
                        : finalReview
                          ? 'Review the results and code changes before giving final approval.'
                          : 'Approve this result when you are ready to move forward.')}
                  </p>
                </div>
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={busy || !canApprove}
                  onClick={onApprove}
                >
                  {taskApprovalLabel(task)}
                </button>
              </div>
            )}
            <form
              className="planning-composer"
              onSubmit={(event) => {
                event.preventDefault()
                void send()
              }}
            >
              <label className="sr-only" htmlFor="workflow-message">
                {inputLabel}
              </label>
              <textarea
                ref={composer}
                id="workflow-message"
                className="field"
                rows={2}
                maxLength={4000}
                value={draft}
                readOnly={busy}
                aria-describedby="workflow-message-help"
                placeholder={
                  refining
                    ? 'Answer questions or clarify the task…'
                    : retrospective
                      ? 'Focus the retrospective on a specific concern…'
                      : planning
                        ? 'Ask a question or refine the plan…'
                        : finalReview
                          ? 'Describe changes to send back to Integrate…'
                          : 'Add revision or rework instructions…'
                }
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault()
                    void send()
                  }
                }}
              />
              <div className="planning-composer-actions">
                <div className="planning-composer-context">
                  {planning || finalReview || support ? (
                    <span className="planning-mode">
                      {support
                        ? taskStageLabel(task, currentStage)
                        : planning
                          ? 'Plan'
                          : 'Request changes'}
                    </span>
                  ) : (
                    <select
                      className="planning-mode workflow-message-action"
                      aria-label="Message action"
                      value={action}
                      disabled={busy || active}
                      onChange={(event) =>
                        setAction(event.target.value as MessageAction)
                      }
                    >
                      <option value="revise">
                        {'Revise ' + taskStageLabel(task, task.status)}
                      </option>
                      <option value="send_back">
                        {'Send back to ' + taskStageLabel(task, returnStage)}
                      </option>
                    </select>
                  )}
                  <span
                    className="planning-agent"
                    title={
                      'Messages go to ' +
                      name +
                      ' in ' +
                      taskStageLabel(task, target)
                    }
                  >
                    <svg aria-hidden="true" viewBox="0 0 20 20">
                      <path d="m10 2 2.2 5.8L18 10l-5.8 2.2L10 18l-2.2-5.8L2 10l5.8-2.2Z" />
                    </svg>
                    {name}
                  </span>
                </div>
                {retryable && !active && (
                  <button
                    className="button button-quiet planning-retry"
                    type="button"
                    disabled={busy || !task.routing_mode || !run}
                    onClick={onRetry}
                  >
                    {refining
                      ? 'Refine again'
                      : retrospective
                        ? 'Run retrospective again'
                        : planning
                          ? 'Retry reply'
                          : 'Retry step'}
                  </button>
                )}
                {active ? (
                  <button
                    className="button button-secondary button-icon planning-send planning-stop"
                    type="button"
                    aria-label="Stop reply"
                    title="Stop reply"
                    disabled={
                      busy || Boolean(task.latest_run?.cancel_requested)
                    }
                    onClick={onStop}
                  >
                    <svg aria-hidden="true" viewBox="0 0 20 20">
                      <rect x="5" y="5" width="10" height="10" rx="1.5" />
                    </svg>
                  </button>
                ) : (
                  <button
                    className="button button-primary button-icon planning-send"
                    type="submit"
                    aria-label={sendLabel}
                    title={sendLabel}
                    aria-busy={busy}
                    disabled={!canSend || !draft.trim()}
                  >
                    <svg aria-hidden="true" viewBox="0 0 20 20">
                      <path d="M10 16V4m-5 5 5-5 5 5" />
                    </svg>
                  </button>
                )}
              </div>
            </form>
            <p id="workflow-message-help" className="planning-composer-hint">
              {unavailable
                ? name + ' must be installed before sending.'
                : 'Enter to send · Shift+Enter for a new line · ' + consequence}
            </p>
          </>
        )}
        {error && (
          <p role="alert" className="feedback feedback-error form-error">
            {error}
          </p>
        )}
      </div>
    </section>
  )
}

function ConversationTurn({
  run,
  routing,
  current,
}: {
  run: Run
  routing: Routing | null
  current: boolean
}) {
  const hasReply = Boolean(run.result.summary || run.result.details)
  const failure =
    run.state === 'cancelled'
      ? 'Reply stopped.'
      : run.state === 'interrupted'
        ? 'Reply interrupted. Retry when you are ready.'
        : run.state === 'failed' || (run.state === 'blocked' && !hasReply)
          ? run.error ||
            'The agent could not reply. Try again or send a message.'
          : ''
  return (
    <>
      {run.feedback && (
        <li className="planning-message planning-message-user">
          <span className="sr-only">You</span>
          <div className="planning-message-text">{run.feedback}</div>
        </li>
      )}
      {(hasReply || failure) && (
        <li
          className="planning-message planning-message-agent workflow-run"
          data-stage={run.stage}
          data-current-run={current}
          data-run-id={run.id}
          aria-label={
            stageLabels[run.stage] +
            ' · ' +
            agentLabel(run.agent, routing) +
            ' · Run ' +
            run.sequence
          }
        >
          <p className="workflow-run-meta">
            {stageLabels[run.stage]} · {agentLabel(run.agent, routing)} · Run{' '}
            {run.sequence}
          </p>
          {run.result.summary && (
            <p className="planning-message-summary">{run.result.summary}</p>
          )}
          {run.result.details && (
            <PlanningMessage>{run.result.details}</PlanningMessage>
          )}
          {failure && <p className="planning-reply-error">{failure}</p>}
          {Boolean(run.result.tests?.length) && (
            <section
              aria-label={
                run.stage === 'integrate'
                  ? 'Implementation validation'
                  : 'Validation evidence'
              }
            >
              <ul className="test-report workflow-test-report">
                {run.result.tests!.map((test, index) => (
                  <li key={index}>
                    <strong
                      className={'test-outcome test-outcome-' + test.outcome}
                    >
                      {test.outcome === 'pass'
                        ? 'Passed'
                        : test.outcome === 'fail'
                          ? 'Failed'
                          : 'Not run'}
                    </strong>
                    <code>{test.command}</code>
                    <p>{test.details}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {run.log && (
            <div className="planning-diagnostics">
              <details>
                <summary>
                  {run.stage === 'plan' ? 'Reply diagnostics' : 'Execution log'}
                </summary>
                {run.cli_version && (
                  <p className="workflow-hint">{run.cli_version}</p>
                )}
                <pre className="run-log">{run.log}</pre>
              </details>
            </div>
          )}
        </li>
      )}
    </>
  )
}
