import { useId, useState } from 'react'
import { updateTaskSettings } from './api'
import type { Approach, FrontierAgent, Routing, Task } from './api'

export function RoutingFields({
  mode,
  frontier,
  routing,
  disabled,
  onMode,
  onFrontier,
}: {
  mode: Approach
  frontier: FrontierAgent
  routing: Routing | null
  disabled: boolean
  onMode: (mode: Approach) => void
  onFrontier: (agent: FrontierAgent) => void
}) {
  const id = useId()
  const selected = routing?.agents.find((agent) => agent.id === frontier)
  return (
    <div className="task-routing-fields">
      <label className="field-label" htmlFor={`${id}-approach`}>
        Approach
      </label>
      <select
        id={`${id}-approach`}
        className="field"
        value={mode}
        disabled={disabled}
        onChange={(event) => onMode(event.target.value as Approach)}
      >
        {routing?.approaches.map((approach) => (
          <option key={approach.id} value={approach.id}>
            {approach.label}
          </option>
        ))}
      </select>
      {mode !== 'local_only' && (
        <>
          <label className="field-label" htmlFor={`${id}-frontier`}>
            Frontier agent
          </label>
          <select
            id={`${id}-frontier`}
            className="field"
            value={frontier}
            disabled={disabled}
            onChange={(event) =>
              onFrontier(event.target.value as FrontierAgent)
            }
          >
            {routing?.agents
              .filter((agent) => agent.kind === 'frontier')
              .map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.label}
                  {agent.available ? '' : ' — Not installed'}
                </option>
              ))}
          </select>
          {selected && !selected.available && (
            <p className="workflow-hint">
              Install {selected.label} before starting its stages.
            </p>
          )}
        </>
      )}
      <p className="workflow-hint">
        {mode === 'hybrid'
          ? 'The frontier agent plans and reviews. Pi implements and tests.'
          : mode === 'local_only'
            ? 'Pi handles every stage using its configured model.'
            : 'The selected frontier agent handles every stage.'}
      </p>
    </div>
  )
}

export function TaskRoutingEditor({
  task,
  routing,
  disabled,
  onTask,
}: {
  task: Task
  routing: Routing | null
  disabled: boolean
  onTask: (task: Task) => void
}) {
  const [mode, setMode] = useState<Approach>(task.routing_mode ?? 'frontier')
  const [frontier, setFrontier] = useState<FrontierAgent>(
    task.frontier_agent ?? 'codex',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const changed =
    mode !== task.routing_mode ||
    (mode !== 'local_only' && frontier !== task.frontier_agent)
  async function save() {
    setBusy(true)
    setError('')
    try {
      onTask(
        await updateTaskSettings(task, {
          routing_mode: mode,
          frontier_agent: mode === 'local_only' ? null : frontier,
        }),
      )
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not save routing.',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="task-routing-editor">
      {!task.routing_mode && (
        <p className="feedback feedback-warning">
          Choose routing before continuing this existing task.
        </p>
      )}
      <RoutingFields
        mode={mode}
        frontier={frontier}
        routing={routing}
        disabled={disabled || busy}
        onMode={setMode}
        onFrontier={setFrontier}
      />
      <button
        type="button"
        className="button button-secondary step-button"
        disabled={disabled || busy || !changed}
        onClick={() => void save()}
      >
        {busy ? 'Saving…' : 'Save routing'}
      </button>
      {error && (
        <p role="alert" className="feedback feedback-error">
          {error}
        </p>
      )}
    </div>
  )
}
