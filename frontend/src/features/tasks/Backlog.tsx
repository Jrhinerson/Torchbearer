import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { createTask, listTasks } from './api'
import type { Task } from './api'

const dateFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
})

export default function Backlog() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const titleInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    listTasks(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setTasks(result)
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoadError(
            error instanceof Error
              ? error.message
              : 'Could not load your tasks.',
          )
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [reload])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setSaveError('')
    setAnnouncement('')
    try {
      const task = await createTask(title, description)
      setTasks((current) => [task, ...current])
      setTitle('')
      setDescription('')
      setAnnouncement(`Added ${task.title} to the backlog.`)
      titleInput.current?.focus()
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : 'Could not save your task.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">YOUR WORKSPACE</p>
          <h1>Build with intention.</h1>
          <p className="page-description">
            Capture the work. Keep ownership of the decisions.
          </p>
        </div>
      </header>

      <div className="board-toolbar">
        <span className="active-view">Backlog</span>
        <span className="toolbar-note">
          A clear starting point for your next step
        </span>
      </div>

      <div className="workspace-grid">
        <section
          className="backlog-column"
          aria-labelledby="backlog-heading"
          aria-busy={loading}
        >
          <div className="column-heading">
            <h2 id="backlog-heading">
              <span className="status-dot" />
              Backlog
            </h2>
            <span className="task-count" aria-label={`${tasks.length} tasks`}>
              {tasks.length}
            </span>
          </div>
          {loading ? (
            <p className="state-message" role="status">
              Loading your tasks…
            </p>
          ) : loadError ? (
            <div className="error-state" role="alert">
              <p>{loadError}</p>
              <button
                className="text-button"
                onClick={() => {
                  setLoading(true)
                  setLoadError('')
                  setReload((value) => value + 1)
                }}
              >
                Try again
              </button>
            </div>
          ) : tasks.length === 0 ? (
            <div className="empty-state">
              <span className="empty-mark" aria-hidden="true">
                ↗
              </span>
              <h3>Start with a clear task.</h3>
              <p>
                What do you want to accomplish?
                <br />
                Add it to your backlog to begin.
              </p>
            </div>
          ) : (
            <ul className="task-list">
              {tasks.map((task) => (
                <li key={task.id}>
                  <article className="task-card" aria-label={task.title}>
                    <span className="task-status">Backlog</span>
                    <h3>{task.title}</h3>
                    {task.description && (
                      <p className="task-description">{task.description}</p>
                    )}
                    <footer className="task-footer">
                      <span>
                        Added{' '}
                        <time dateTime={task.created_at}>
                          {dateFormat.format(new Date(task.created_at))}
                        </time>
                      </span>
                      <span className="card-marker" aria-hidden="true">
                        ↗
                      </span>
                    </footer>
                  </article>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="task-composer" aria-labelledby="new-task-heading">
          <p className="eyebrow">MAKE THE NEXT STEP EXPLICIT</p>
          <h2 id="new-task-heading">New task</h2>
          <p className="composer-description">
            Give the work a name and a little context.
          </p>
          <form onSubmit={handleSubmit} aria-labelledby="new-task-heading">
            <label htmlFor="task-title">
              Title <span className="required-mark">*</span>
            </label>
            <input
              id="task-title"
              ref={titleInput}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="What needs to happen?"
              maxLength={200}
              required
              disabled={saving}
            />
            <label htmlFor="task-description">
              Description <span className="optional">optional</span>
            </label>
            <textarea
              id="task-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Describe the goal, context, or a useful starting point."
              rows={5}
              maxLength={10000}
              disabled={saving}
            />
            {saveError && (
              <p className="form-error" role="alert">
                {saveError}
              </p>
            )}
            <button
              type="submit"
              className="primary-button submit-button"
              disabled={saving || loading || Boolean(loadError)}
            >
              {saving ? 'Adding task…' : 'Add to backlog'}
              <span aria-hidden="true">↗</span>
            </button>
          </form>
          <p className="composer-footnote">
            A task captures intent. You decide when it is ready to move forward.
          </p>
        </aside>
      </div>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </>
  )
}
