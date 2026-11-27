import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError } from '../../lib/api'
import { getWorkType, saveAssignment } from './api'
import type { WorkflowDefinition, WorkType } from './api'

export function WorkTypeCard({
  workType,
  index,
  workflows,
  onUpdate,
}: {
  workType: WorkType
  index: number
  workflows: WorkflowDefinition[]
  onUpdate: (workType: WorkType) => void
}) {
  const [selected, setSelected] = useState(workType.assigned_workflow)
  const [pending, setPending] = useState<'save' | 'reload' | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [conflict, setConflict] = useState(false)
  const changed = selected !== workType.assigned_workflow
  const busy = pending !== null
  const selectedWorkflow = workflows.find(
    (workflow) => workflow.key === selected,
  )
  const assigned = workflows.find(
    (workflow) => workflow.key === workType.assigned_workflow,
  )
  const recommended = workflows.find(
    (workflow) => workflow.key === workType.recommended_workflow,
  )

  function choose(workflow: string) {
    setSelected(workflow)
    setNotice('')
    if (!conflict) setError('')
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (busy || !changed || conflict || !selectedWorkflow) return
    setPending('save')
    setError('')
    setNotice('')
    try {
      onUpdate(await saveAssignment(workType, selected))
      setNotice('Assignment saved.')
    } catch (cause) {
      setConflict(cause instanceof ApiError && cause.status === 409)
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not save this assignment.',
      )
    } finally {
      setPending(null)
    }
  }

  async function reload() {
    if (busy) return
    setPending('reload')
    setNotice('')
    try {
      onUpdate(await getWorkType(workType.key))
      setConflict(false)
      setError('')
      setNotice(
        'Latest assignment loaded. Review your selection before saving.',
      )
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not reload this assignment.',
      )
    } finally {
      setPending(null)
    }
  }

  return (
    <article
      className="surface work-type-card"
      aria-labelledby={`work-type-${workType.key}`}
    >
      <div className="work-type-main">
        <div>
          <span className="work-type-number" aria-hidden="true">
            {String(index + 1).padStart(2, '0')}
          </span>
          <h2 id={`work-type-${workType.key}`}>{workType.name}</h2>
          <p className="work-type-description">{workType.description}</p>
          <div className="work-type-badges">
            <span className="badge">
              {workType.assigned_workflow === workType.recommended_workflow
                ? 'Recommended'
                : 'Custom assignment'}
            </span>
            {changed && <span className="badge">Unsaved change</span>}
          </div>
        </div>
        <form
          className="work-type-assignment"
          onSubmit={(event) => void save(event)}
          aria-busy={busy}
        >
          <label className="field-label" htmlFor={`workflow-${workType.key}`}>
            Workflow
          </label>
          <select
            id={`workflow-${workType.key}`}
            className="field"
            aria-label={`Workflow for ${workType.name}`}
            value={selected}
            disabled={busy}
            onChange={(event) => choose(event.target.value)}
          >
            {workflows.map((workflow) => (
              <option key={workflow.key} value={workflow.key}>
                {workflow.name}
              </option>
            ))}
          </select>
          <p className="work-type-current">
            Assigned: {assigned?.name ?? 'Workflow unavailable'}
          </p>
          <p className="work-type-recommendation">
            Recommended: {recommended?.name ?? 'Workflow unavailable'}
          </p>
          <div className="work-type-actions">
            <button
              type="submit"
              className="button button-primary"
              disabled={busy || !changed || conflict || !selectedWorkflow}
              aria-busy={pending === 'save'}
            >
              {pending === 'save' ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              className="button button-secondary"
              disabled={busy || !changed}
              onClick={() => choose(workType.assigned_workflow)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button button-quiet"
              disabled={busy || selected === workType.recommended_workflow}
              onClick={() => choose(workType.recommended_workflow)}
            >
              Use recommended workflow
            </button>
          </div>
          {error && (
            <div className="feedback feedback-error" role="alert">
              <p>{error}</p>
              {conflict && (
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={busy}
                  onClick={() => void reload()}
                >
                  {pending === 'reload' ? 'Reloading…' : 'Reload assignment'}
                </button>
              )}
            </div>
          )}
          <p className="work-type-notice" role="status">
            {notice}
          </p>
        </form>
      </div>
      {changed && (
        <p className="work-type-preview">
          Save to assign {selectedWorkflow?.name} to this work type.
        </p>
      )}
    </article>
  )
}
