import { useEffect, useMemo, useRef } from 'react'
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
} from '@xyflow/react'
import type { Node, NodeProps, ReactFlowInstance } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { WorkflowGraph, WorkflowNode } from './api'
import { canConnect, orderedNodes } from './graph'

type CanvasNode = Node<{ node: WorkflowNode; number: number }, 'workflow'>

function WorkflowCard({ data }: NodeProps<CanvasNode>) {
  return (
    <div className="workflow-node">
      <Handle type="target" position={Position.Left} />
      <h3>
        <span>{String(data.number).padStart(2, '0')}</span> {data.node.title}
      </h3>
      <p>{data.node.description}</p>
      <h4>Before moving on</h4>
      <ul>
        {data.node.requirements.slice(0, 2).map((item) => (
          <li key={item.id}>{item.description}</li>
        ))}
      </ul>
      {data.node.requirements.length > 2 && (
        <p className="workflow-muted">
          +{data.node.requirements.length - 2} more requirement
          {data.node.requirements.length > 3 ? 's' : ''}
        </p>
      )}
      {data.node.requirements.some((item) => item.kind === 'approval') && (
        <span className="badge workflow-approval">Human approval</span>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

const nodeTypes = { workflow: WorkflowCard }
const fitOptions = {
  padding: { x: '32px', top: '24px', bottom: '132px' },
} as const

export default function WorkflowCanvas({
  graph,
  selected,
  onSelect,
  editing = false,
  onChange,
}: {
  graph: WorkflowGraph
  selected: string | null
  onSelect: (id: string | null) => void
  editing?: boolean
  onChange: (graph: WorkflowGraph) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const instance = useRef<ReactFlowInstance<CanvasNode> | null>(null)
  useEffect(() => {
    if (!container.current) return
    let width = container.current.clientWidth
    let frame = 0
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width === width) return
      width = entry.contentRect.width
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        void instance.current?.fitView(fitOptions)
      })
    })
    observer.observe(container.current)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [])
  const nodes = useMemo(
    () =>
      orderedNodes(graph).map((node, index): CanvasNode => ({
        id: node.id,
        type: 'workflow',
        position: node.position,
        selected: node.id === selected,
        data: { node, number: index + 1 },
        ariaLabel: `${index + 1}. ${node.title}. ${node.requirements.length} requirements.`,
      })),
    [graph, selected],
  )
  const edges = useMemo(
    () =>
      graph.edges.map((edge) => ({
        ...edge,
        type: 'smoothstep',
        label: edge.condition,
        markerEnd: { type: MarkerType.ArrowClosed },
        ariaLabel: `${graph.nodes.find((node) => node.id === edge.source)?.title} to ${graph.nodes.find((node) => node.id === edge.target)?.title}: ${edge.condition}`,
      })),
    [graph],
  )
  return (
    <div
      className="workflow-canvas"
      aria-label="Workflow graph"
      ref={container}
    >
      <ReactFlow<CanvasNode>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={(value) => {
          instance.current = value
        }}
        fitView
        fitViewOptions={fitOptions}
        minZoom={0.001}
        maxZoom={1.5}
        nodesDraggable={editing}
        nodesConnectable={editing}
        isValidConnection={(connection) =>
          canConnect(graph, connection.source, connection.target)
        }
        onConnect={(connection) => {
          if (
            editing &&
            canConnect(graph, connection.source, connection.target)
          )
            onChange({
              ...graph,
              edges: [
                ...graph.edges,
                {
                  id: `edge-${crypto.randomUUID()}`,
                  source: connection.source,
                  target: connection.target,
                  condition: 'Requirements met',
                },
              ],
            })
        }}
        onNodesChange={(changes) => {
          const updated = changes.applyTo(nodes)
          const nextSelected = updated.find((node) => node.selected)?.id ?? null
          if (nextSelected !== selected) onSelect(nextSelected)
          if (!editing) return
          const positions = new Map(
            updated
              .filter((node) =>
                graph.nodes.some(
                  (original) =>
                    original.id === node.id &&
                    (original.position.x !== node.position.x ||
                      original.position.y !== node.position.y),
                ),
              )
              .map((node) => [node.id, node.position]),
          )
          if (positions.size)
            onChange({
              ...graph,
              nodes: graph.nodes.map((node) =>
                positions.has(node.id)
                  ? { ...node, position: positions.get(node.id)! }
                  : node,
              ),
            })
        }}
        edgesFocusable
        multiSelectionKeyCode={null}
        selectionKeyCode={null}
        deleteKeyCode={null}
        onNodeClick={(_, node) => onSelect(node.id)}
        onPaneClick={() => onSelect(null)}
        proOptions={{ hideAttribution: false }}
      >
        <Background gap={20} size={1} />
        <Controls showInteractive={false} fitViewOptions={fitOptions} />
      </ReactFlow>
    </div>
  )
}
