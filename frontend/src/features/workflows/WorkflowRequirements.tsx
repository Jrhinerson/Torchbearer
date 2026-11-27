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
}: {
  node: WorkflowNode
  graph: WorkflowGraph
  onSelect: (id: string) => void
}) {
  const transitions = graph.edges.filter((edge) => edge.source === node.id)
  return (
    <>
      <p>{node.description}</p>
      <h3>Before moving on</h3>
      <RequirementList requirements={node.requirements} />
      <h3>Expected outputs</h3>
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
          <h3>Iteration</h3>
          <p>{node.iteration_note}</p>
        </>
      )}
      <h3>Continues to</h3>
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
