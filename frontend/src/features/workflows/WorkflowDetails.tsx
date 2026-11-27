import type { WorkflowDefinition } from './api'

export function WorkflowDetails({
  workflow,
}: {
  workflow: WorkflowDefinition
}) {
  return (
    <details className="workflow-definition">
      <summary>Workflow details</summary>
      <div className="workflow-definition-content">
        <p>{workflow.description}</p>
        <div className="workflow-definition-grid">
          <div>
            <h3>Steps</h3>
            <ol>
              {workflow.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
          <div>
            <h3>Expected outputs</h3>
            <ul>
              {workflow.outputs.map((output) => (
                <li key={output}>{output}</li>
              ))}
            </ul>
            <h3>Validation</h3>
            <ul>
              {workflow.validation.map((check) => (
                <li key={check}>{check}</li>
              ))}
            </ul>
            <h3>Approval points</h3>
            <ul>
              {workflow.approval_points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </details>
  )
}
