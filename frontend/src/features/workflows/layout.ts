import { graphlib, layout } from '@dagrejs/dagre'
import type { WorkflowGraph } from './api'

export function arrangeGraph(graph: WorkflowGraph): WorkflowGraph {
  const dag = new graphlib.Graph()
  dag.setGraph({
    rankdir: 'LR',
    nodesep: 80,
    ranksep: 100,
    marginx: 24,
    marginy: 24,
  })
  dag.setDefaultEdgeLabel(() => ({}))
  for (const node of graph.nodes)
    dag.setNode(node.id, { width: 260, height: 340 })
  for (const edge of graph.edges) dag.setEdge(edge.source, edge.target)
  layout(dag)
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const position = dag.node(node.id)
      return {
        ...node,
        position: {
          x: Math.round(position.x - 130),
          y: Math.round(position.y - 170),
        },
      }
    }),
  }
}
