import { useEffect, useRef, useState } from 'react'
import { agentLabel } from './api'
import type { Routing, Run, RunHistory, Task } from './api'

export function PlanningConversation({
  task,
  history,
  run,
  routing,
  active,
  busy,
  canApprove,
  approvalHint,
  onMessage,
  onRetry,
  onStop,
  onApprove,
}: {
  task: Task
  history: RunHistory
  run: Run | undefined
  routing: Routing | null
  active: boolean
  busy: boolean
  canApprove: boolean
  approvalHint: string
  onMessage: (message: string) => Promise<boolean>
  onRetry: () => void
  onStop: () => void
  onApprove: () => void
}) {
  const [draft, setDraft] = useState('')
  const submitting = useRef(false)
  const thread = useRef<HTMLOListElement>(null)
  const composer = useRef<HTMLTextAreaElement>(null)
  const followReplies = useRef(true)
  const attempts = history.runs
    .filter((attempt) => attempt.stage === 'plan')
    .sort((a, b) => a.sequence - b.sequence)
  const agent = task.latest_run?.agent ?? task.stage_agents.plan
  const name = agent ? agentLabel(agent, routing) : 'Planning agent'
  const canSend = Boolean(run && task.routing_mode && !active && !busy)
  const ready = run?.state === 'succeeded'
  const retryable =
    run &&
    (['failed', 'cancelled', 'interrupted'].includes(run.state) ||
      (run.state === 'blocked' && !run.result.summary && !run.result.details))

  useEffect(() => {
    if (followReplies.current && thread.current)
      thread.current.scrollTop = thread.current.scrollHeight
  }, [task.latest_run?.id, task.latest_run?.state, history.runs])

  async function send() {
    const message = draft.trim()
    if (!canSend || !message || submitting.current) return
    submitting.current = true
    followReplies.current = true
    try {
      if (await onMessage(message)) setDraft('')
    } finally {
      submitting.current = false
      composer.current?.focus()
    }
  }

  return (
    <section className="planning-conversation" aria-label="Plan together">
      <p className="workflow-hint planning-intro">
        Work through the plan with {name}. Implementation starts only after you
        approve the plan.
      </p>
      <ol
        ref={thread}
        className="planning-messages"
        aria-label="Planning conversation"
        tabIndex={0}
        onScroll={() => {
          const element = thread.current!
          followReplies.current =
            element.scrollHeight - element.scrollTop - element.clientHeight < 60
        }}
      >
        <li className="planning-message planning-message-user">
          <p className="planning-speaker">You</p>
          <p className="planning-message-summary">{task.title}</p>
          {task.description && (
            <div className="planning-message-text">{task.description}</div>
          )}
        </li>
        {attempts.map((attempt) => (
          <PlanningTurn key={attempt.id} run={attempt} routing={routing} />
        ))}
        {active && (
          <li className="planning-message planning-message-agent">
            <p className="planning-speaker">{name}</p>
            <p role="status" className="planning-reply-status">
              {task.latest_run?.cancel_requested
                ? 'Stopping reply…'
                : task.latest_run?.state === 'queued'
                  ? 'Waiting to reply…'
                  : 'Thinking…'}
            </p>
          </li>
        )}
      </ol>
      <form
        className="planning-composer"
        onSubmit={(event) => {
          event.preventDefault()
          void send()
        }}
      >
        <label className="field-label" htmlFor="planning-message">
          Message your planning agent
        </label>
        <textarea
          ref={composer}
          id="planning-message"
          className="field"
          rows={3}
          maxLength={4000}
          value={draft}
          readOnly={busy}
          placeholder="Answer a question, add context, or refine the plan…"
          aria-describedby="planning-message-help"
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
          <p id="planning-message-help" className="workflow-hint">
            Enter to send · Shift+Enter for a new line
          </p>
          {active ? (
            <button
              className="button button-secondary"
              type="button"
              disabled={busy || Boolean(task.latest_run?.cancel_requested)}
              onClick={onStop}
            >
              Stop reply
            </button>
          ) : (
            <>
              {retryable && (
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={!canSend}
                  onClick={onRetry}
                >
                  Retry reply
                </button>
              )}
              <button
                className="button button-primary"
                type="submit"
                disabled={!canSend || !draft.trim()}
              >
                {busy ? 'Sending…' : 'Send message'}
              </button>
            </>
          )}
        </div>
      </form>
      {ready && !active && (
        <div className="planning-approval">
          <div>
            <p className="planning-message-summary">Ready to move forward?</p>
            <p className="workflow-hint">
              {approvalHint ||
                'Approve this plan when it matches what you want to build.'}
            </p>
          </div>
          <button
            className="button button-secondary"
            type="button"
            disabled={busy || !canApprove}
            onClick={onApprove}
          >
            Approve plan &amp; start Integrate
          </button>
        </div>
      )}
    </section>
  )
}

function PlanningTurn({ run, routing }: { run: Run; routing: Routing | null }) {
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
          <p className="planning-speaker">You</p>
          <div className="planning-message-text">{run.feedback}</div>
        </li>
      )}
      {(hasReply || failure) && (
        <li className="planning-message planning-message-agent">
          <p className="planning-speaker">{agentLabel(run.agent, routing)}</p>
          {run.result.summary && (
            <p className="planning-message-summary">{run.result.summary}</p>
          )}
          {run.result.details && (
            <div className="planning-message-text">{run.result.details}</div>
          )}
          {failure && <p className="planning-reply-error">{failure}</p>}
        </li>
      )}
    </>
  )
}
