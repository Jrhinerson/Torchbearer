import type { WorkflowGraph, WorkflowRequirement } from './api'

export function orderedNodes(graph: WorkflowGraph) {
  const incoming = new Map(graph.nodes.map((node) => [node.id, 0]))
  for (const edge of graph.edges)
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1)
  const result = []
  const remaining = [...graph.nodes]
  while (remaining.length) {
    const index = remaining.findIndex((node) => incoming.get(node.id) === 0)
    if (index < 0) return [...result, ...remaining]
    const [node] = remaining.splice(index, 1)
    result.push(node)
    for (const edge of graph.edges.filter((item) => item.source === node.id))
      incoming.set(edge.target, (incoming.get(edge.target) ?? 1) - 1)
  }
  return result
}

export function requirementText(requirement: WorkflowRequirement) {
  return requirement.applicability === 'when_relevant'
    ? `${requirement.description} (When relevant: ${requirement.applicability_note})`
    : requirement.description
}

export function graphSummary(graph: WorkflowGraph) {
  const nodes = orderedNodes(graph)
  return {
    outputs: [...new Set(nodes.flatMap((node) => node.outputs))],
    approvals: nodes.flatMap((node) =>
      node.requirements
        .filter((requirement) => requirement.kind === 'approval')
        .map(requirementText),
    ),
  }
}
