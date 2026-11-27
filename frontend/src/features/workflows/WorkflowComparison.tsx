import type { WorkflowGraph } from './api'
import { orderedNodes } from './graph'
import { RequirementList } from './WorkflowRequirements'

export function WorkflowComparison({
  latest,
  draft,
}: {
  latest: WorkflowGraph
  draft: WorkflowGraph
}) {
  return (
    <div className="workflow-comparison">
      {[
        { name: 'Latest saved version', graph: latest },
        { name: 'Your draft', graph: draft },
      ].map(({ name, graph }) => (
        <section key={name} className="surface">
          <h3>{name}</h3>
          <p className="workflow-muted">
            Entry:{' '}
            {graph.nodes.find((node) => node.id === graph.entry_node_id)?.title}
          </p>
          {orderedNodes(graph).map((node) => (
            <details key={node.id}>
              <summary>{node.title}</summary>
              <p>{node.description}</p>
              <RequirementList requirements={node.requirements} />
              <p>Outputs: {node.outputs.join('; ') || 'None specified'}</p>
              {node.iteration_note && <p>Iteration: {node.iteration_note}</p>}
              <p className="workflow-muted">
                Position: {node.position.x}, {node.position.y}
              </p>
              <ul>
                {graph.edges
                  .filter((edge) => edge.source === node.id)
                  .map((edge) => (
                    <li key={edge.id}>
                      {
                        graph.nodes.find((item) => item.id === edge.target)
                          ?.title
                      }
                      : {edge.condition}
                    </li>
                  ))}
              </ul>
            </details>
          ))}
        </section>
      ))}
    </div>
  )
}
