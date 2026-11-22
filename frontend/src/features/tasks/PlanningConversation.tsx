import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { agentLabel } from './api'
import type { Routing, Run, RunHistory, Task } from './api'
import { PlanningMessage } from './PlanningMessage'

export function PlanningConversation({
  task,
  history,
  run,
  routing,
  active,
  busy,
  canApprove,
  approvalHint,
  error,
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
  error: string
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
  const [following, setFollowing] = useState(true)
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
  }, [draft])

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
      if (await onMessage(message)) setDraft('')
    } finally {
      submitting.current = false
      composer.current?.focus()
    }
  }

  return (
    <section className="planning-conversation" aria-label="Plan together">
      <div className="planning-thread">
        <ol
          ref={thread}
          className="planning-messages"
          aria-label="Planning conversation"
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
          {attempts.map((attempt) => (
            <PlanningTurn key={attempt.id} run={attempt} routing={routing} />
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
          {run?.log && (
            <li className="planning-diagnostics">
              <details>
                <summary>Reply diagnostics</summary>
                <pre className="run-log">{run.log}</pre>
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
        {ready && !active && (
          <div className="planning-approval">
            <div>
              <p className="planning-message-summary">Plan ready for review</p>
              <p className="workflow-hint">
                {approvalHint ||
                  'Approve when the plan matches what you want to build.'}
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
        {error && (
          <p role="alert" className="feedback feedback-error form-error">
            {error}
          </p>
        )}
        <form
          className="planning-composer"
          onSubmit={(event) => {
            event.preventDefault()
            void send()
          }}
        >
          <label className="sr-only" htmlFor="planning-message">
            Message your planning agent
          </label>
          <textarea
            ref={composer}
            id="planning-message"
            className="field"
            rows={2}
            maxLength={4000}
            value={draft}
            readOnly={busy}
            placeholder="Ask a question or refine the plan…"
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
            <div className="planning-composer-context">
              <span className="planning-mode">Plan</span>
              <span className="planning-agent" title={'Planning with ' + name}>
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
                disabled={!canSend}
                onClick={onRetry}
              >
                Retry reply
              </button>
            )}
            {active ? (
              <button
                className="button button-secondary button-icon planning-send planning-stop"
                type="button"
                aria-label="Stop reply"
                title="Stop reply"
                disabled={busy || Boolean(task.latest_run?.cancel_requested)}
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
                aria-label="Send message"
                title="Send message"
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
        <p id="planning-message-help" className="planning-composer-hint">
          Enter to send · Shift+Enter for a new line · Approve before
          implementation
        </p>
      </div>
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
          <span className="sr-only">You</span>
          <div className="planning-message-text">{run.feedback}</div>
        </li>
      )}
      {(hasReply || failure) && (
        <li className="planning-message planning-message-agent">
          <span className="sr-only">{agentLabel(run.agent, routing)}</span>
          {run.result.summary && (
            <p className="planning-message-summary">{run.result.summary}</p>
          )}
          {run.result.details && (
            <PlanningMessage>{run.result.details}</PlanningMessage>
          )}
          {failure && <p className="planning-reply-error">{failure}</p>}
        </li>
      )}
    </>
  )
}
