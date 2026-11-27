import { agentLabel } from './api'
import { useId, useLayoutEffect, useRef, useState } from 'react'
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
  const list = useRef<HTMLOListElement>(null)
  const marker = `flow-arrow-${useId().replaceAll(':', '')}`
  const [paths, setPaths] = useState<
    { id: string; d: string; planned: boolean; rework: boolean }[]
  >([])
  useLayoutEffect(() => {
    const element = list.current
    if (!element) return
    function measure() {
      if (!element) return
      const origin = element.parentElement!.getBoundingClientRect()
      const boxes = new Map(
        [...element.querySelectorAll<HTMLElement>('[data-flow-id]')].map(
          (item) => [item.dataset.flowId!, item.getBoundingClientRect()],
        ),
      )
      const bottom = Math.max(
        0,
        ...[...boxes.values()].map((box) => box.bottom - origin.top),
      )
      const tops = [...boxes.values()].map((box) => box.top)
      const oneRow = !tops.length || Math.max(...tops) - Math.min(...tops) < 8
      const next = flow.edges.flatMap((edge, index) => {
        const source = boxes.get(edge.source),
          target = boxes.get(edge.target)
        if (!source || !target) return []
        const rework = edge.kind !== 'forward'
        if (rework && !oneRow) return []
        const x1 = source.right - origin.left,
          x2 = target.left - origin.left
        const y1 = source.top + source.height / 2 - origin.top,
          y2 = target.top + target.height / 2 - origin.top
        const d = rework
          ? `M ${x1 - source.width / 2} ${source.bottom - origin.top} V ${bottom + 20} H ${x2 + target.width / 2} V ${target.bottom - origin.top + 2}`
          : Math.abs(y1 - y2) < 8
            ? `M ${x1} ${y1} L ${x2 - 2} ${y2}`
            : `M ${x1} ${y1} H ${x1 + 5} V ${source.bottom - origin.top + 6} H ${x2 - 5} V ${y2} H ${x2 - 2}`
        const sourceNode = flow.nodes.find((node) => node.id === edge.source)
        return [
          {
            id: `${edge.kind}-${index}`,
            d,
            rework,
            planned:
              edge.kind === 'possible_rework' ||
              !['accepted', 'succeeded'].includes(sourceNode?.state ?? ''),
          },
        ]
      })
      setPaths((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    element
      .querySelectorAll<HTMLElement>('[data-flow-id]')
      .forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [flow.nodes, flow.edges])
  return (
    <div className="task-flow" aria-label="Execution flow">
      <div className="flow-map">
        <ol className="flow-nodes" ref={list}>
          {flow.nodes.map((node) => (
            <li
              key={node.id}
              className="flow-node"
              data-state={node.state}
              data-kind={node.kind}
              data-flow-id={node.id}
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
                <span className="flow-node-state">
                  {stateLabel(node.state)}
                </span>
              </button>
            </li>
          ))}
        </ol>
        <svg className="flow-connectors" aria-hidden="true">
          <defs>
            <marker
              id={marker}
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M0 0 L8 4 L0 8" fill="currentColor" />
            </marker>
          </defs>
          {paths.map((path) => (
            <path
              key={path.id}
              d={path.d}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeDasharray={path.planned ? '4 4' : undefined}
              markerEnd={`url(#${marker})`}
            />
          ))}
        </svg>
      </div>
      {flow.edges.some((edge) => edge.kind === 'possible_rework') && (
        <p className="workflow-hint">
          Review may return work for revision; recorded returns appear below.
        </p>
      )}
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
