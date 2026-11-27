import type { WorkflowGraph, WorkflowNode, WorkflowRequirement } from './api'

export function RequirementList({
  requirements,
}: {
  requirements: WorkflowRequirement[]
}) {
  return (
    <ul className="workflow-requirements">
      {requirements.map((requirement) => (
        <li key={requirement.id}>
          <p>{requirement.description}</p>
          {requirement.kind === 'validation' && (
            <span className="badge">Validation check</span>
          )}
          {requirement.kind === 'approval' && (
            <span className="badge workflow-approval">Human approval</span>
          )}
          {requirement.applicability === 'when_relevant' && (
            <p className="workflow-muted">
              <span className="badge">When relevant</span>{' '}
              {requirement.applicability_note}
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}

export function NodeRequirements({
  node,
  graph,
  onSelect,
  nested = false,
}: {
  node: WorkflowNode
  graph: WorkflowGraph
  onSelect: (id: string) => void
  nested?: boolean
}) {
  const Heading = nested ? 'h4' : 'h3'
  const transitions = graph.edges.filter((edge) => edge.source === node.id)
  return (
    <>
      <p>{node.description}</p>
      <Heading>Before moving on</Heading>
      <RequirementList requirements={node.requirements} />
      <Heading>Expected outputs</Heading>
      {node.outputs.length ? (
        <ul>
          {node.outputs.map((output, index) => (
            <li key={index}>{output}</li>
          ))}
        </ul>
      ) : (
        <p className="workflow-muted">No separate output specified.</p>
      )}
      {node.iteration_note && (
        <>
          <Heading>Iteration</Heading>
          <p>{node.iteration_note}</p>
        </>
      )}
      <Heading>Continues to</Heading>
      {transitions.length ? (
        <ul className="workflow-transitions">
          {transitions.map((edge) => (
            <li key={edge.id}>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => onSelect(edge.target)}
              >
                <span>
                  {graph.nodes.find((item) => item.id === edge.target)?.title}
                  <small>{edge.condition}</small>
                </span>
                <span aria-hidden="true">→</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="workflow-muted">
          Workflow complete after these requirements are met.
        </p>
      )}
    </>
  )
}
