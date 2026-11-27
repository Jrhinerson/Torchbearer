import { useEffect, useRef, useState } from 'react'
import { getActivity } from './api'
import type { ActivityEvent } from './api'

export function OperationsActivity({
  query,
  project,
  refreshToken,
  onSelect,
}: {
  query: string
  project: string
  refreshToken?: string
  onSelect: (taskId: string, runId: string | null) => void
}) {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const olderLoaded = useRef(false)
  const paging = useRef(false)
  const controllerRef = useRef<AbortController | null>(null)
  function merge(incoming: ActivityEvent[]) {
    setEvents((current) => {
      const combined = new Map(current.map((event) => [event.id, event]))
      incoming.forEach((event) => combined.set(event.id, event))
      return [...combined.values()].sort(
        (a, b) =>
          b.created_at.localeCompare(a.created_at) ||
          b.kind.localeCompare(a.kind) ||
          b.id.localeCompare(a.id),
      )
    })
  }
  useEffect(() => {
    const controller = new AbortController()
    controllerRef.current = controller
    getActivity(controller.signal, query, project)
      .then((page) => {
        if (!controller.signal.aborted) {
          merge(page.events)
          if (!olderLoaded.current) setCursor(page.next_cursor)
          setError('')
          setLoaded(true)
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : 'Could not load activity.',
          )
      })
    return () => controller.abort()
  }, [query, project, refreshToken, attempt])
  async function loadOlder() {
    const controller = controllerRef.current
    if (!cursor || !controller || paging.current) return
    paging.current = true
    setBusy(true)
    try {
      const page = await getActivity(controller.signal, query, project, cursor)
      if (!controller.signal.aborted) {
        olderLoaded.current = true
        merge(page.events)
        setCursor(page.next_cursor)
        setError('')
      }
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : 'Could not load older activity.',
        )
    } finally {
      paging.current = false
      setBusy(false)
    }
  }
  return (
    <section className="operations-activity" aria-label="Operations activity">
      {!loaded && !error && <p role="status">Loading activity…</p>}
      {error && (
        <p role="alert" className="feedback feedback-error">
          {error} Activity will retry automatically.{' '}
          <button
            type="button"
            className="button button-link"
            onClick={() => {
              olderLoaded.current = false
              setEvents([])
              setCursor(null)
              setAttempt((value) => value + 1)
            }}
          >
            Reload activity
          </button>
        </p>
      )}
      {loaded && !events.length && (
        <p>No recorded activity matches these filters.</p>
      )}
      <ol className="activity-feed">
        {events.map((event) => (
          <li key={event.id}>
            <span
              className={`activity-dot ${event.kind === 'started' ? 'running' : ''}`}
              aria-hidden="true"
            />
            <div>
              <button
                className="button button-link"
                type="button"
                onClick={() => onSelect(event.task_id, event.run_id)}
              >
                {event.task_title}
              </button>
              <p>
                {event.actor === 'human' ? 'You' : event.actor} ·{' '}
                {event.stage.replaceAll('_', ' ')} ·{' '}
                {event.action.replaceAll('_', ' ')}
              </p>
            </div>
            <time dateTime={event.created_at}>
              {new Date(event.created_at).toLocaleString()}
            </time>
          </li>
        ))}
      </ol>
      {cursor && (
        <button
          type="button"
          className="button button-secondary"
          disabled={busy}
          onClick={() => void loadOlder()}
        >
          {busy ? 'Loading…' : 'Load older activity'}
        </button>
      )}
    </section>
  )
}
