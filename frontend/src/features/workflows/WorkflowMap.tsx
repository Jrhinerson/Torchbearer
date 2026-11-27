import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { getWorkflowGraph } from './api'
import type {
  WorkflowDefinition,
  WorkflowGraphDetail,
  WorkflowNode,
} from './api'
import { graphSummary, orderedNodes } from './graph'
import { NodeRequirements } from './WorkflowRequirements'
import { useWorkflowEditor } from './useWorkflowEditor'
import { WorkflowDecision } from './WorkflowDecision'
import { WorkflowNodeEditor } from './WorkflowNodeEditor'
import { WorkflowComparison } from './WorkflowComparison'
import { arrangeGraph } from './layout'
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
  const [removing, setRemoving] = useState<WorkflowNode | null>(null)
  const [canvasVersion, setCanvasVersion] = useState(0)
  const inspectorHeading = useRef<HTMLHeadingElement>(null)
  const workflow = workflows.find((item) => item.key === workflowKey)

  useEffect(() => {
    const controller = new AbortController()
    getWorkflowGraph(workflowKey, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setDetail(value)
          setError('')
        }
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
  const editor = useWorkflowEditor(current, setDetail)
  const graph = editor.draft?.graph ?? current?.graph
  const nodes = graph ? orderedNodes(graph) : []
  const node = nodes.find((item) => item.id === selected)
  const summary = graph ? graphSummary(graph) : null

  function select(id: string | null) {
    setSelected(id)
  }

  function addStep() {
    if (!graph || editor.busy || graph.nodes.length >= 100) return
    const terminals = nodes.filter(
      (item) => !graph.edges.some((edge) => edge.source === item.id),
    )
    const source =
      terminals.find((item) => item.id === selected) ?? terminals.at(-1)
    if (!source) return
    const id = `node-${crypto.randomUUID()}`
    const next: WorkflowNode = {
      id,
      title: 'New step',
      description: '',
      outputs: [],
      iteration_note: '',
      requirements: [
        {
          id: `req-${crypto.randomUUID()}`,
          description: '',
          kind: 'requirement',
          applicability: 'always',
        },
      ],
      position: {
        x: Math.max(...graph.nodes.map((item) => item.position.x)) + 360,
        y: source.position.y,
      },
    }
    editor.change({
      ...graph,
      nodes: [...graph.nodes, next],
      edges: [
        ...graph.edges,
        {
          id: `edge-${crypto.randomUUID()}`,
          source: source.id,
          target: id,
          condition: 'Requirements met',
        },
      ],
    })
    setSelected(id)
    setCanvasVersion((value) => value + 1)
  }

  function removeStep() {
    if (!graph || !removing) return
    const remaining = graph.nodes.filter((item) => item.id !== removing.id)
    const edges = graph.edges.filter(
      (edge) => edge.source !== removing.id && edge.target !== removing.id,
    )
    const entry =
      remaining.find((item) => !edges.some((edge) => edge.target === item.id))
        ?.id ?? remaining[0].id
    editor.change({
      ...graph,
      nodes: remaining,
      edges,
      entry_node_id:
        graph.entry_node_id === removing.id ? entry : graph.entry_node_id,
    })
    setSelected(remaining[0].id)
    setRemoving(null)
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
            disabled={Boolean(editor.draft) || editor.busy}
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
        {current?.graph && (
          <div className="workflow-map-actions">
            {editor.draft ? (
              <>
                {editor.dirty && <span className="badge">Unsaved changes</span>}
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={editor.busy}
                  onClick={editor.cancel}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="button button-primary"
                  disabled={
                    editor.busy ||
                    !editor.dirty ||
                    editor.errors.length > 0 ||
                    editor.conflict
                  }
                  aria-busy={editor.pending === 'save'}
                  onClick={() => void editor.save()}
                >
                  {editor.pending === 'save' ? 'Saving…' : 'Save workflow'}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="button button-primary"
                onClick={() => {
                  editor.start()
                  setSelected(node?.id ?? nodes[0]?.id ?? null)
                }}
              >
                Edit workflow
              </button>
            )}
          </div>
        )}
      </div>
      <p className="workflow-description">{workflow?.description}</p>
      <p className="workflow-muted">
        Workflow definition · Requirements describe when to continue
      </p>
      <p role="status" className="workflow-muted">
        {editor.notice}
      </p>
      {editor.error && (
        <div className="feedback feedback-error" role="alert">
          <p>{editor.error}</p>
          {editor.fieldErrors.length > 0 && (
            <ul>
              {editor.fieldErrors.map((message, index) => (
                <li key={index}>{message}</li>
              ))}
            </ul>
          )}
          {editor.conflict && (
            <button
              type="button"
              className="button button-secondary"
              disabled={editor.busy}
              onClick={() => void editor.loadLatest()}
            >
              {editor.pending === 'reload'
                ? 'Loading…'
                : 'Load latest to compare'}
            </button>
          )}
        </div>
      )}
      {editor.latest?.graph && editor.draft && (
        <section className="feedback feedback-warning workflow-conflict">
          <h2>Compare workflow versions</h2>
          <p>
            Review and copy any changes you want from the latest version into
            your draft. Keeping the draft uses it as the full replacement when
            you save.
          </p>
          <WorkflowComparison
            latest={editor.latest.graph}
            draft={editor.draft.graph}
          />
          <div className="workflow-map-actions">
            <button
              type="button"
              className="button button-secondary"
              disabled={editor.busy}
              onClick={editor.cancel}
            >
              Discard draft and use latest
            </button>
            <button
              type="button"
              className="button button-primary"
              disabled={editor.busy}
              onClick={editor.keepDraft}
            >
              Keep draft against latest revision
            </button>
          </div>
        </section>
      )}
      {editor.draft && editor.errors.length > 0 && (
        <div className="feedback feedback-warning" role="status">
          <p>Before saving:</p>
          <ul>
            {editor.errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}
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
            <h2>{current?.name}</h2>
            {editor.draft && (
              <div className="workflow-map-actions">
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={editor.busy || nodes.length >= 100}
                  onClick={addStep}
                >
                  + Add step
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={editor.busy || editor.errors.length > 0}
                  onClick={() => {
                    editor.change(arrangeGraph(graph))
                    setCanvasVersion((value) => value + 1)
                  }}
                >
                  Arrange
                </button>
                <label className="workflow-entry-label">
                  Entry step
                  <select
                    className="field"
                    value={graph.entry_node_id}
                    disabled={editor.busy}
                    onChange={(event) =>
                      editor.change({
                        ...graph,
                        entry_node_id: event.target.value,
                      })
                    }
                  >
                    {nodes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title || 'Untitled step'}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
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
            className={`workflow-map-layout${node && (view === 'graph' || editor.draft) ? ' has-inspector' : ''}`}
          >
            <div className="workflow-map-main">
              {view === 'graph' ? (
                <Suspense fallback={<p role="status">Loading graph canvas…</p>}>
                  <WorkflowCanvas
                    key={`${workflowKey}-${canvasVersion}`}
                    graph={graph}
                    selected={selected}
                    onSelect={select}
                    editing={Boolean(editor.draft) && !editor.busy}
                    onChange={editor.change}
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
                      {editor.draft && (
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() => select(item.id)}
                        >
                          Edit {item.title}
                        </button>
                      )}
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
            {node && (view === 'graph' || editor.draft) && (
              <aside
                className="surface workflow-inspector"
                aria-labelledby="node-requirements-heading"
              >
                <div className="workflows-toolbar">
                  <div>
                    <p className="workflows-eyebrow">
                      {editor.draft ? 'Edit node' : 'Node requirements'}
                    </p>
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
                {editor.draft ? (
                  <WorkflowNodeEditor
                    key={node.id}
                    node={node}
                    graph={graph}
                    disabled={editor.busy}
                    onChange={editor.change}
                    onRemove={() => setRemoving(node)}
                  />
                ) : (
                  <NodeRequirements
                    node={node}
                    graph={graph}
                    onSelect={select}
                  />
                )}
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
      {editor.navigation ? (
        <WorkflowDecision
          title="Discard workflow changes?"
          confirmLabel="Discard changes"
          onCancel={editor.keepEditing}
          onConfirm={editor.discardAndLeave}
        >
          <p>Your workflow draft has not been saved.</p>
        </WorkflowDecision>
      ) : (
        removing &&
        graph && (
          <WorkflowDecision
            title={`Remove ${removing.title}?`}
            confirmLabel="Remove step"
            onCancel={() => setRemoving(null)}
            onConfirm={removeStep}
          >
            <p>
              The step and these connections will be removed. Reconnect the
              remaining steps before saving.
            </p>
            <ul>
              {graph.edges
                .filter(
                  (edge) =>
                    edge.source === removing.id || edge.target === removing.id,
                )
                .map((edge) => (
                  <li key={edge.id}>
                    {graph.nodes.find((item) => item.id === edge.source)?.title}{' '}
                    →{' '}
                    {graph.nodes.find((item) => item.id === edge.target)?.title}
                    : {edge.condition}
                  </li>
                ))}
            </ul>
          </WorkflowDecision>
        )
      )}
    </div>
  )
}
