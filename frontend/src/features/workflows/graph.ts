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

export function canConnect(
  graph: WorkflowGraph,
  source: string,
  target: string,
) {
  if (
    source === target ||
    target === graph.entry_node_id ||
    graph.edges.some((edge) => edge.source === source && edge.target === target)
  )
    return false
  if (
    ![source, target].every((id) => graph.nodes.some((node) => node.id === id))
  )
    return false
  const visited = new Set<string>()
  const pending = [target]
  while (pending.length) {
    const id = pending.pop()!
    if (id === source) return false
    if (visited.has(id)) continue
    visited.add(id)
    pending.push(
      ...graph.edges
        .filter((edge) => edge.source === id)
        .map((edge) => edge.target),
    )
  }
  return true
}

export function graphErrors(graph: WorkflowGraph) {
  const errors: string[] = []
  if (graph.nodes.length < 1 || graph.nodes.length > 100)
    errors.push('Use between 1 and 100 steps.')
  if (graph.edges.length > 300) errors.push('Use at most 300 transitions.')
  if (
    new TextEncoder().encode(
      JSON.stringify(graph).replace(
        /[\u007f-\uffff]/g,
        (character) =>
          `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
      ),
    ).length >
    256 * 1024
  )
    errors.push(
      'The workflow is too large; reduce its text or number of steps.',
    )
  for (const node of graph.nodes) {
    const name = node.title.trim() || 'Untitled step'
    if (!node.title.trim() || node.title.length > 150)
      errors.push(`${name}: enter a title of at most 150 characters.`)
    if (!node.description.trim() || node.description.length > 4000)
      errors.push(`${name}: enter a description of at most 4000 characters.`)
    if (!node.requirements.length || node.requirements.length > 30)
      errors.push(`${name}: include between 1 and 30 requirements.`)
    for (const requirement of node.requirements) {
      if (
        !requirement.description.trim() ||
        requirement.description.length > 2000
      )
        errors.push(
          `${name}: each requirement needs a description of at most 2000 characters.`,
        )
      if (
        requirement.applicability === 'when_relevant' &&
        !requirement.applicability_note?.trim()
      )
        errors.push(
          `${name}: explain when the conditional requirement applies.`,
        )
    }
    if (
      node.outputs.length > 30 ||
      node.outputs.some((output) => !output.trim() || output.length > 2000)
    )
      errors.push(
        `${name}: use at most 30 nonempty outputs of at most 2000 characters.`,
      )
    if (
      Object.values(node.position).some(
        (value) => !Number.isFinite(value) || Math.abs(value) > 100000,
      )
    )
      errors.push(`${name}: position must be between -100000 and 100000.`)
    if ((node.iteration_note?.length ?? 0) > 2000)
      errors.push(`${name}: use at most 2000 characters in the iteration note.`)
  }
  const reached = new Set<string>()
  const pending = [graph.entry_node_id]
  while (pending.length) {
    const id = pending.pop()!
    if (reached.has(id)) continue
    reached.add(id)
    pending.push(
      ...graph.edges
        .filter((edge) => edge.source === id)
        .map((edge) => edge.target),
    )
  }
  const roots = graph.nodes.filter(
    (node) => !graph.edges.some((edge) => edge.target === node.id),
  )
  if (roots.length !== 1 || roots[0]?.id !== graph.entry_node_id)
    errors.push('Choose exactly one entry step, with no incoming transitions.')
  if (graph.nodes.some((node) => !reached.has(node.id)))
    errors.push('Connect every step to the entry step.')
  for (const edge of graph.edges) {
    if (!edge.condition.trim() || edge.condition.length > 160)
      errors.push(
        'Every transition needs a condition of at most 160 characters.',
      )
    if (
      !canConnect(
        { ...graph, edges: graph.edges.filter((item) => item.id !== edge.id) },
        edge.source,
        edge.target,
      )
    )
      errors.push(
        'Transitions must connect distinct steps without cycles or duplicate connections.',
      )
  }
  return [...new Set(errors)]
}
