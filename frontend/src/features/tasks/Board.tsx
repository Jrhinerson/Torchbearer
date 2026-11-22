import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { createTask, deleteTask, listTasks } from './api'
import type { Task } from './api'
import ProjectPicker from '../projects/ProjectPicker'
import type { Project } from '../projects/api'

const columns = [
  { id: 'backlog', title: 'Backlog' },
  { id: 'plan', title: 'Plan' },
  { id: 'integrate', title: 'Integrate' },
  { id: 'test', title: 'Test' },
  { id: 'final_approval', title: 'Final Approval' },
] as const

const dateFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
})

export default function Board() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [project, setProject] = useState<Project | null>(null)
  const [projectBusy, setProjectBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<{
    id: string
    message: string
  } | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const titleInput = useRef<HTMLInputElement>(null)
  const newTaskButton = useRef<HTMLButtonElement>(null)
  const composer = useRef<HTMLDialogElement>(null)
  const formBusy = saving || projectBusy

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

  function openComposer() {
    setSaveError('')
    composer.current?.showModal()
    titleInput.current?.focus()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (formBusy) return
    setSaving(true)
    setSaveError('')
    setAnnouncement('')
    try {
      const task = await createTask(title, description, project?.id ?? null)
      setTasks((current) => [task, ...current])
      setTitle('')
      setDescription('')
      setAnnouncement(`Added ${task.title} to the backlog.`)
      composer.current?.close()
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : 'Could not save your task.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(task: Task) {
    if (!window.confirm(`Delete "${task.title}"? This cannot be undone.`))
      return
    setDeletingId(task.id)
    setDeleteError(null)
    setAnnouncement('')
    try {
      await deleteTask(task.id)
      setTasks((current) => current.filter((item) => item.id !== task.id))
      setAnnouncement(`Deleted ${task.title} from the backlog.`)
      newTaskButton.current?.focus()
    } catch (error) {
      setDeleteError({
        id: task.id,
        message:
          error instanceof Error
            ? error.message
            : 'Could not delete your task.',
      })
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      <h1 className="sr-only">Kanban board</h1>
      <div
        className="board-scroll"
        role="region"
        aria-label="Kanban columns"
        tabIndex={0}
      >
        <div className="kanban-board">
          {columns.map((column) => {
            const columnTasks = tasks.filter(
              (task) => task.status === column.id,
            )
            const isBacklog = column.id === 'backlog'
            return (
              <section
                className="workflow-column"
                key={column.id}
                aria-labelledby={`${column.id}-heading`}
                aria-busy={isBacklog && loading}
              >
                <div className="column-heading">
                  <h2 id={`${column.id}-heading`}>
                    <span className="status-dot" aria-hidden="true" />
                    {column.title}
                  </h2>
                  <span
                    className="task-count"
                    aria-label={`${columnTasks.length} ${column.title} tasks`}
                  >
                    {columnTasks.length}
                  </span>
                </div>
                {isBacklog && (
                  <button
                    type="button"
                    className="new-task-button"
                    ref={newTaskButton}
                    onClick={openComposer}
                    disabled={loading || Boolean(loadError)}
                  >
                    <span aria-hidden="true">+</span> New Task
                  </button>
                )}
                {isBacklog && loading ? (
                  <p className="state-message" role="status">
                    Loading your tasks…
                  </p>
                ) : isBacklog && loadError ? (
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
                ) : columnTasks.length === 0 ? (
                  <p className="column-empty-state">No tasks yet.</p>
                ) : (
                  <ul className="task-list">
                    {columnTasks.map((task) => (
                      <li key={task.id}>
                        <article className="task-card" aria-label={task.title}>
                          <h3>{task.title}</h3>
                          {task.project && (
                            <p
                              className="task-project"
                              title={task.project.path}
                            >
                              <span aria-hidden="true">▱</span>{' '}
                              {task.project.name}
                              {task.project.archived && (
                                <span className="removed-project-label">
                                  Removed project
                                </span>
                              )}
                            </p>
                          )}
                          {task.description && (
                            <p className="task-description">
                              {task.description}
                            </p>
                          )}
                          <footer className="task-footer">
                            <span>
                              Added{' '}
                              <time dateTime={task.created_at}>
                                {dateFormat.format(new Date(task.created_at))}
                              </time>
                            </span>
                            <button
                              type="button"
                              className="delete-task-button"
                              aria-label={`Delete ${task.title}`}
                              disabled={deletingId !== null}
                              onClick={() => handleDelete(task)}
                            >
                              {deletingId === task.id ? 'Deleting…' : 'Delete'}
                            </button>
                          </footer>
                          {deleteError?.id === task.id && (
                            <p className="form-error" role="alert">
                              {deleteError.message}
                            </p>
                          )}
                        </article>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      </div>

      <dialog
        ref={composer}
        className="task-dialog"
        aria-labelledby="new-task-heading"
        aria-describedby="new-task-description"
        onCancel={(event) => {
          if (formBusy) event.preventDefault()
        }}
        onClose={() => newTaskButton.current?.focus()}
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">MAKE THE NEXT STEP EXPLICIT</p>
            <h2 id="new-task-heading">New task</h2>
          </div>
          <button
            type="button"
            className="close-dialog-button"
            aria-label="Close new task"
            onClick={() => composer.current?.close()}
            disabled={formBusy}
          >
            ×
          </button>
        </div>
        <p id="new-task-description" className="composer-description">
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
            disabled={formBusy}
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
            disabled={formBusy}
          />
          <ProjectPicker
            selected={project}
            onSelect={setProject}
            disabled={formBusy}
            onBusyChange={setProjectBusy}
            onProjectChange={(updated) =>
              setTasks((current) =>
                current.map((task) =>
                  task.project?.id === updated.id
                    ? { ...task, project: updated }
                    : task,
                ),
              )
            }
          />
          {saveError && (
            <p className="form-error" role="alert">
              {saveError}
            </p>
          )}
          <div className="dialog-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => composer.current?.close()}
              disabled={formBusy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={formBusy}
            >
              {saving ? 'Adding task…' : 'Add to backlog'}
              <span aria-hidden="true">↗</span>
            </button>
          </div>
        </form>
        <p className="composer-footnote">
          A task captures intent. You decide when it is ready to move forward.
        </p>
      </dialog>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </>
  )
}
