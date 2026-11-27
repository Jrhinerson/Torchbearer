import { lazy, Suspense, useEffect, useState } from 'react'
import { listWorkflows, listWorkTypes } from './api'
import type { WorkflowDefinition, WorkType } from './api'
import { WorkTypeCard } from './WorkTypeCard'
import './workflow-map.css'

const WorkflowMap = lazy(() => import('./WorkflowMap'))

function workflowLocation() {
  const params = new URLSearchParams(window.location.search)
  return {
    tab: params.get('tab') === 'map' ? 'map' : 'assignments',
    workflow: params.get('workflow') ?? 'plan-execute',
  }
}

interface Catalogue {
  workflows: WorkflowDefinition[]
  workTypes: WorkType[]
}

export default function WorkflowsPage() {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [query, setQuery] = useState('')
  const [location, setLocation] = useState(workflowLocation)

  useEffect(() => {
    const update = () => setLocation(workflowLocation())
    window.addEventListener('popstate', update)
    return () => window.removeEventListener('popstate', update)
  }, [])

  function navigate(tab: string, workflow = location.workflow) {
    const url = new URL(window.location.href)
    url.searchParams.set('tab', tab)
    url.searchParams.set('workflow', workflow)
    window.history.pushState(null, '', url)
    setLocation(workflowLocation())
  }

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
  const workTypes = [...(catalogue?.workTypes ?? [])].sort((left, right) =>
    left.name.localeCompare(right.name, 'en', { sensitivity: 'base' }),
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
  const visibleCount = workTypes.filter(matches).length

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
      <div className="workflows-tabs" role="tablist" aria-label="Workflows">
        {['assignments', 'map'].map((tab) => (
          <button
            key={tab}
            id={`workflows-tab-${tab}`}
            type="button"
            role="tab"
            aria-selected={location.tab === tab}
            aria-controls={`workflows-panel-${tab}`}
            tabIndex={location.tab === tab ? 0 : -1}
            onClick={() => navigate(tab)}
            onKeyDown={(event) => {
              if (
                !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
              )
                return
              event.preventDefault()
              const next =
                event.key === 'Home'
                  ? 'assignments'
                  : event.key === 'End'
                    ? 'map'
                    : tab === 'map'
                      ? 'assignments'
                      : 'map'
              navigate(next)
              document.getElementById(`workflows-tab-${next}`)?.focus()
            }}
          >
            {tab === 'map' ? 'Workflow map' : 'Assignments'}
          </button>
        ))}
      </div>
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
        <div
          id="workflows-panel-assignments"
          role="tabpanel"
          aria-labelledby="workflows-tab-assignments"
          hidden={location.tab !== 'assignments'}
          className="workflow-assignments"
        >
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
            {workTypes.map((workType, index) => (
              <li key={workType.key} hidden={!matches(workType)}>
                <WorkTypeCard
                  workType={workType}
                  index={index}
                  workflows={catalogue.workflows}
                  onUpdate={(updated) =>
                    setCatalogue(
                      (current) =>
                        current && {
                          ...current,
                          workTypes: current.workTypes.map((item) =>
                            item.key === updated.key ? updated : item,
                          ),
                        },
                    )
                  }
                />
              </li>
            ))}
          </ul>
        </div>
      )}
      {catalogue && location.tab === 'map' && (
        <div
          id="workflows-panel-map"
          role="tabpanel"
          aria-labelledby="workflows-tab-map"
        >
          <Suspense fallback={<p role="status">Loading workflow map…</p>}>
            <WorkflowMap
              workflows={catalogue.workflows}
              workflowKey={
                catalogue.workflows.some(
                  (item) => item.key === location.workflow,
                )
                  ? location.workflow
                  : 'plan-execute'
              }
              onChoose={(key) => navigate('map', key)}
            />
          </Suspense>
        </div>
      )}
    </section>
  )
}
