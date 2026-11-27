import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { getWorkflowGraph } from './api'
import type { WorkflowDefinition, WorkflowGraphDetail } from './api'
import { graphSummary, orderedNodes } from './graph'
import { NodeRequirements } from './WorkflowRequirements'
import './workflow-map.css'

const WorkflowCanvas = lazy(() => import('./WorkflowCanvas'))

export default function WorkflowMap({
  workflows,
  workflowKey,
  onChoose,
}: {
  workflows: WorkflowDefinition[]
  workflowKey: string
  onChoose: (key: string) => void
}) {
  const [detail, setDetail] = useState<WorkflowGraphDetail | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [view, setView] = useState<'graph' | 'steps'>('graph')
  const inspectorHeading = useRef<HTMLHeadingElement>(null)
  const workflow = workflows.find((item) => item.key === workflowKey)

  useEffect(() => {
    const controller = new AbortController()
    getWorkflowGraph(workflowKey, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setDetail(value)
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Could not load the workflow map.',
          )
      })
    return () => controller.abort()
  }, [workflowKey, attempt])

  const current = detail?.key === workflowKey ? detail : null
  const graph = current?.graph
  const nodes = graph ? orderedNodes(graph) : []
  const node = nodes.find((item) => item.id === selected)
  const summary = graph ? graphSummary(graph) : null

  function select(id: string | null) {
    setSelected(id)
  }

  return (
    <div className="workflow-map">
      <div className="workflows-toolbar">
        <div className="workflow-picker">
          <label className="field-label" htmlFor="map-workflow">
            Workflow
          </label>
          <select
            id="map-workflow"
            className="field"
            value={workflowKey}
            onChange={(event) => {
              setError('')
              setSelected(null)
              onChoose(event.target.value)
            }}
          >
            {workflows.map((item) => (
              <option key={item.key} value={item.key}>
                {item.name}
                {item.has_graph ? '' : ' — Map not authored yet'}
              </option>
            ))}
          </select>
        </div>
        <span className="badge">
          {workflows.filter((item) => item.has_graph).length} of{' '}
          {workflows.length} mapped
        </span>
      </div>
      <p className="workflow-description">{workflow?.description}</p>
      <p className="workflow-muted">
        Workflow definition · Requirements describe when to continue
      </p>
      {error ? (
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
      ) : (
        !current && <p role="status">Loading workflow map…</p>
      )}
      {current && !graph && (
        <div className="surface workflow-map-empty">
          <h2>{current.name}</h2>
          <p>Map not authored yet.</p>
          <p className="workflow-muted">
            Workflow maps are being added one at a time.
          </p>
        </div>
      )}
      {graph && (
        <>
          <div className="workflows-toolbar">
            <h2>{current.name}</h2>
            <div
              className="workflow-view-toggle"
              role="group"
              aria-label="Workflow view"
            >
              <button
                type="button"
                className="button button-secondary"
                aria-pressed={view === 'graph'}
                onClick={() => setView('graph')}
              >
                Graph
              </button>
              <button
                type="button"
                className="button button-secondary"
                aria-pressed={view === 'steps'}
                onClick={() => setView('steps')}
              >
                Ordered steps
              </button>
            </div>
          </div>
          <div
            className={`workflow-map-layout${node && view === 'graph' ? ' has-inspector' : ''}`}
          >
            <div className="workflow-map-main">
              {view === 'graph' ? (
                <Suspense fallback={<p role="status">Loading graph canvas…</p>}>
                  <WorkflowCanvas
                    key={workflowKey}
                    graph={graph}
                    selected={selected}
                    onSelect={select}
                  />
                </Suspense>
              ) : (
                <ol className="workflow-steps" aria-label="Workflow steps">
                  {nodes.map((item, index) => (
                    <li key={item.id} className="surface">
                      <h3>
                        <span className="workflow-step-number">
                          {String(index + 1).padStart(2, '0')}
                        </span>{' '}
                        {item.title}
                      </h3>
                      <NodeRequirements
                        node={item}
                        graph={graph}
                        onSelect={(id) => {
                          setView('graph')
                          select(id)
                        }}
                      />
                    </li>
                  ))}
                </ol>
              )}
              <p className="workflow-map-count">
                {nodes.length} steps · {graph.edges.length} transitions
              </p>
            </div>
            {node && view === 'graph' && (
              <aside
                className="surface workflow-inspector"
                aria-labelledby="node-requirements-heading"
              >
                <div className="workflows-toolbar">
                  <div>
                    <p className="workflows-eyebrow">Node requirements</p>
                    <h2
                      id="node-requirements-heading"
                      ref={inspectorHeading}
                      tabIndex={-1}
                    >
                      {String(nodes.indexOf(node) + 1).padStart(2, '0')}{' '}
                      {node.title}
                    </h2>
                  </div>
                  <button
                    type="button"
                    className="button button-quiet"
                    aria-label="Close node requirements"
                    onClick={() => select(null)}
                  >
                    ×
                  </button>
                </div>
                <NodeRequirements node={node} graph={graph} onSelect={select} />
              </aside>
            )}
          </div>
          <div className="workflow-map-summary">
            <section className="surface">
              <h2>Expected outputs</h2>
              <ul>
                {summary?.outputs.map((output, index) => (
                  <li key={index}>{output}</li>
                ))}
              </ul>
            </section>
            <section className="surface">
              <h2>Approval points</h2>
              {summary?.approvals.length ? (
                <ul>
                  {summary.approvals.map((approval, index) => (
                    <li key={index}>{approval}</li>
                  ))}
                </ul>
              ) : (
                <p className="workflow-muted">No human approval specified.</p>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}
