import { agentLabel } from './api'
import type { Routing, TaskFlowData } from './api'

const stateLabel = (state: string) =>
  ({
    succeeded: 'Recorded complete',
    accepted: 'Accepted',
    waiting: 'Waiting for you',
    planned: 'Planned',
  })[state] ?? state.replaceAll('_', ' ')

export function TaskFlow({
  flow,
  routing,
  onRun,
}: {
  flow: TaskFlowData
  routing: Routing | null
  onRun: (id: string | null) => void
}) {
  return (
    <div className="task-flow" aria-label="Execution flow">
      <ol className="flow-nodes">
        {flow.nodes.map((node) => (
          <li
            key={node.id}
            className="flow-node"
            data-state={node.state}
            data-kind={node.kind}
          >
            <button
              type="button"
              className="button button-quiet"
              onClick={() => onRun(node.run_id)}
              aria-label={`${node.label}: ${stateLabel(node.state)}`}
            >
              <span className="flow-node-title">
                {node.state === 'accepted' || node.state === 'succeeded'
                  ? '✓ '
                  : node.state === 'waiting'
                    ? '◇ '
                    : ''}
                {node.label}
              </span>
              <span>
                {node.agent === 'human'
                  ? 'You'
                  : node.agent
                    ? agentLabel(node.agent, routing)
                    : 'Unassigned'}
              </span>
              <span className="flow-node-state">{stateLabel(node.state)}</span>
            </button>
          </li>
        ))}
      </ol>
      <details className="flow-attempts">
        <summary>Attempt history ({flow.runs.length})</summary>
        <ol>
          {[...flow.runs].reverse().map((run) => (
            <li key={run.id}>
              <button
                type="button"
                className="button button-link"
                onClick={() => onRun(run.id)}
              >
                Attempt {run.sequence} · {run.stage.replaceAll('_', ' ')} ·{' '}
                {agentLabel(run.agent, routing)} · {run.state}
              </button>
            </li>
          ))}
        </ol>
      </details>
      {flow.edges
        .filter((edge) => edge.kind === 'rework')
        .map((edge) => (
          <p className="flow-rework" key={edge.decision_id}>
            ↳ Changes requested: {edge.source.replaceAll('_', ' ')} →{' '}
            {edge.target.replaceAll('_', ' ')} · Decision {edge.decision_id}
          </p>
        ))}
      <p className="workflow-hint">
        Recorded results · Human approval gates · Planned next steps
      </p>
    </div>
  )
}
