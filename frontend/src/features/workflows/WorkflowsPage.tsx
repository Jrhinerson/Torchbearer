import { useEffect, useState } from 'react'
import { listWorkflows, listWorkTypes } from './api'
import type { WorkflowDefinition, WorkType } from './api'
import { WorkflowDetails } from './WorkflowDetails'

interface Catalogue {
  workflows: WorkflowDefinition[]
  workTypes: WorkType[]
}

export default function WorkflowsPage() {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [query, setQuery] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      listWorkflows(controller.signal),
      listWorkTypes(controller.signal),
    ])
      .then(([workflows, workTypes]) => {
        if (!controller.signal.aborted) setCatalogue({ workflows, workTypes })
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Could not load workflows.',
          )
      })
    return () => controller.abort()
  }, [attempt])

  const workflows = new Map(
    catalogue?.workflows.map((workflow) => [workflow.key, workflow]),
  )
  const search = query.trim().toLocaleLowerCase()
  const matches = (workType: WorkType) =>
    [
      workType.name,
      workType.description,
      workflows.get(workType.assigned_workflow)?.name ?? '',
    ]
      .join(' ')
      .toLocaleLowerCase()
      .includes(search)
  const visibleCount = catalogue?.workTypes.filter(matches).length ?? 0

  return (
    <section className="workflows-page" aria-labelledby="workflows-heading">
      <header className="workflows-header">
        <div>
          <p className="workflows-eyebrow">Engineering practices</p>
          <h1 id="workflows-heading">Workflows</h1>
          <p>Choose how each kind of work gets done.</p>
        </div>
        {catalogue && (
          <span className="badge">{catalogue.workflows.length} workflows</span>
        )}
      </header>
      <p className="workflows-scope">
        Manage application-wide defaults for each work type. Task creation and
        execution do not use these assignments yet.
      </p>
      {!catalogue && !error && (
        <p role="status">Loading work types and workflows…</p>
      )}
      {error && (
        <div className="feedback feedback-error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              setError('')
              setAttempt((value) => value + 1)
            }}
          >
            Try again
          </button>
        </div>
      )}
      {catalogue && (
        <>
          <div className="workflows-toolbar">
            <div className="workflows-search">
              <label className="field-label" htmlFor="work-type-search">
                Search work types or workflows
              </label>
              <input
                id="work-type-search"
                type="search"
                className="field"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name, description, or workflow"
              />
            </div>
            <p role="status">
              {visibleCount} of {catalogue.workTypes.length} work types
            </p>
          </div>
          {visibleCount === 0 && (
            <p className="workflows-empty">
              {catalogue.workTypes.length
                ? 'No work types match your search.'
                : 'No work types are available.'}
            </p>
          )}
          <ul className="work-types-list" aria-label="Work types">
            {catalogue.workTypes.map((workType, index) => {
              const workflow = workflows.get(workType.assigned_workflow)
              return (
                <li key={workType.key} hidden={!matches(workType)}>
                  <article
                    className="surface work-type-card"
                    aria-labelledby={`work-type-${workType.key}`}
                  >
                    <div className="work-type-main">
                      <div>
                        <span className="work-type-number" aria-hidden="true">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <h2 id={`work-type-${workType.key}`}>
                          {workType.name}
                        </h2>
                        <p className="work-type-description">
                          {workType.description}
                        </p>
                      </div>
                      <div className="work-type-assignment">
                        <span className="field-label">Assigned workflow</span>
                        <p className="work-type-current">
                          {workflow?.name ?? 'Workflow unavailable'}
                        </p>
                        <span className="badge">
                          {workType.assigned_workflow ===
                          workType.recommended_workflow
                            ? 'Recommended'
                            : 'Custom assignment'}
                        </span>
                      </div>
                    </div>
                    {workflow && <WorkflowDetails workflow={workflow} />}
                  </article>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
