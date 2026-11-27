import { useEffect, useId, useState } from 'react'
import { listWorkflows, listWorkTypes } from '../workflows/api'
import type { WorkflowDefinition, WorkType } from '../workflows/api'
import { updateTaskSettings } from './api'
import type { Task } from './api'

export function WorkflowChoice({
  value,
  onChange,
  disabled,
  onReady,
}: {
  value: string
  onChange: (value: string) => void
  disabled: boolean
  onReady?: (ready: boolean) => void
}) {
  const fieldId = useId()
  const [catalogue, setCatalogue] = useState<{
    workflows: WorkflowDefinition[]
    types: WorkType[]
  } | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      listWorkflows(controller.signal),
      listWorkTypes(controller.signal),
    ])
      .then(([workflows, types]) => {
        if (!controller.signal.aborted) {
          setCatalogue({ workflows, types })
          onReady?.(true)
          setError('')
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Could not load workflows.',
          )
          onReady?.(false)
        }
      })
    return () => controller.abort()
  }, [attempt, onReady])
  const type = catalogue?.types.find((entry) => entry.key === value)
  const workflow = catalogue?.workflows.find(
    (entry) => entry.key === type?.assigned_workflow,
  )
  return (
    <div className="workflow-choice">
      <label className="field-label" htmlFor={fieldId}>
        Work type
      </label>
      <select
        id={fieldId}
        className="field"
        value={value}
        disabled={disabled || !catalogue}
        onChange={(event) => onChange(event.target.value)}
      >
        {!catalogue && <option value={value}>Loading work types…</option>}
        {catalogue?.types.map((entry) => (
          <option key={entry.key} value={entry.key}>
            {entry.name}
          </option>
        ))}
      </select>
      {workflow && (
        <p className="workflow-hint">
          Workflow: <strong>{workflow.name}</strong>. {workflow.description}
        </p>
      )}
      {error && (
        <p role="alert" className="feedback feedback-error">
          {error}{' '}
          <button
            className="button button-link"
            type="button"
            onClick={() => setAttempt((current) => current + 1)}
          >
            Reload workflows
          </button>
        </p>
      )}
    </div>
  )
}

export function TaskWorkflowEditor({
  task,
  onTask,
}: {
  task: Task
  onTask: (task: Task) => void
}) {
  const [selection, setSelection] = useState(task.work_type ?? 'maintenance')
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save(refresh = false) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      onTask(
        await updateTaskSettings(
          task,
          refresh ? { refresh_workflow: true } : { work_type: selection },
        ),
      )
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not save the workflow.',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <section
      aria-label="Task workflow settings"
      className="task-workflow-settings"
    >
      <p>
        Saved workflow:{' '}
        {task.workflow_snapshot?.name ?? 'Legacy engineering workflow'} ·
        version {task.workflow_snapshot?.definition_version ?? 1}
      </p>
      <WorkflowChoice
        value={selection}
        onChange={setSelection}
        disabled={busy}
        onReady={setReady}
      />
      <div className="dialog-actions">
        <button
          type="button"
          className="button button-secondary"
          disabled={busy || !ready || selection === task.work_type}
          onClick={() => void save()}
        >
          Save workflow
        </button>
        {task.work_type && (
          <button
            type="button"
            className="button button-quiet"
            disabled={busy || selection !== task.work_type}
            onClick={() => void save(true)}
          >
            Refresh workflow
          </button>
        )}
      </div>
      <p className="workflow-hint">
        Workflow and routing are fixed when refinement or planning starts.
        Catalogue changes do not replace this task's saved workflow.
      </p>
      {error && (
        <p role="alert" className="feedback feedback-error">
          {error}
        </p>
      )}
    </section>
  )
}
