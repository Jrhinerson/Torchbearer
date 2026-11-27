import { useMemo } from 'react'
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
} from '@xyflow/react'
import type { Node, NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { WorkflowGraph, WorkflowNode } from './api'
import { orderedNodes } from './graph'

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

export default function WorkflowCanvas({
  graph,
  selected,
  onSelect,
}: {
  graph: WorkflowGraph
  selected: string | null
  onSelect: (id: string | null) => void
}) {
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
    <div className="workflow-canvas" aria-label="Workflow graph">
      <ReactFlow<CanvasNode>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.15}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable
        deleteKeyCode={null}
        onNodeClick={(_, node) => onSelect(node.id)}
        onSelectionChange={({ nodes }) => {
          if (nodes.length === 1) onSelect(nodes[0].id)
        }}
        onPaneClick={() => onSelect(null)}
        proOptions={{ hideAttribution: false }}
      >
        <Background gap={20} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
