import { useState } from 'react'
import type { WorkflowGraph, WorkflowNode, WorkflowRequirement } from './api'
import { canConnect } from './graph'

function RequirementEditor({
  requirement,
  disabled,
  onChange,
  onRemove,
}: {
  requirement: WorkflowRequirement
  disabled: boolean
  onChange: (value: WorkflowRequirement) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(!requirement.description)
  const prefix = `requirement-${requirement.id}`
  return (
    <details
      className="workflow-requirement-editor"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        {requirement.description || 'New requirement'}{' '}
        {requirement.kind === 'approval' && (
          <span className="badge workflow-approval">Human approval</span>
        )}
        {requirement.applicability === 'when_relevant' && (
          <span className="badge">When relevant</span>
        )}
      </summary>
      <div className="workflow-editor-fields">
        <label htmlFor={`${prefix}-description`} className="field-label">
          Requirement description
        </label>
        <textarea
          id={`${prefix}-description`}
          className="field"
          value={requirement.description}
          maxLength={2000}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...requirement, description: event.target.value })
          }
        />
        <label htmlFor={`${prefix}-kind`} className="field-label">
          Requirement kind
        </label>
        <select
          id={`${prefix}-kind`}
          className="field"
          value={requirement.kind}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...requirement,
              kind: event.target.value as WorkflowRequirement['kind'],
            })
          }
        >
          <option value="requirement">Requirement</option>
          <option value="validation">Validation check</option>
          <option value="approval">Human approval</option>
        </select>
        <label htmlFor={`${prefix}-applicability`} className="field-label">
          Applies
        </label>
        <select
          id={`${prefix}-applicability`}
          className="field"
          value={requirement.applicability}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...requirement,
              applicability: event.target
                .value as WorkflowRequirement['applicability'],
            })
          }
        >
          <option value="always">Always</option>
          <option value="when_relevant">When relevant</option>
        </select>
        {requirement.applicability === 'when_relevant' && (
          <>
            <label htmlFor={`${prefix}-note`} className="field-label">
              When does this apply?
            </label>
            <textarea
              id={`${prefix}-note`}
              className="field"
              maxLength={2000}
              value={requirement.applicability_note ?? ''}
              disabled={disabled}
              onChange={(event) =>
                onChange({
                  ...requirement,
                  applicability_note: event.target.value,
                })
              }
            />
          </>
        )}
        <button
          type="button"
          className="button button-destructive"
          disabled={disabled}
          onClick={onRemove}
        >
          Remove requirement
        </button>
      </div>
    </details>
  )
}

export function WorkflowNodeEditor({
  node,
  graph,
  disabled,
  onChange,
  onRemove,
}: {
  node: WorkflowNode
  graph: WorkflowGraph
  disabled: boolean
  onChange: (graph: WorkflowGraph) => void
  onRemove: () => void
}) {
  function changeNode(patch: Partial<WorkflowNode>) {
    onChange({
      ...graph,
      nodes: graph.nodes.map((item) =>
        item.id === node.id ? { ...node, ...patch } : item,
      ),
    })
  }
  const outgoing = graph.edges.filter((edge) => edge.source === node.id)
  const candidates = graph.nodes.filter((item) =>
    canConnect(graph, node.id, item.id),
  )

  return (
    <fieldset className="workflow-editor-fields" disabled={disabled}>
      <legend className="workflow-sr-only">Edit {node.title || 'step'}</legend>
      <label className="field-label" htmlFor="node-title">
        Node title
      </label>
      <input
        id="node-title"
        className="field"
        value={node.title}
        maxLength={150}
        onChange={(event) => changeNode({ title: event.target.value })}
      />
      <label className="field-label" htmlFor="node-description">
        Description
      </label>
      <textarea
        id="node-description"
        className="field"
        value={node.description}
        maxLength={4000}
        onChange={(event) => changeNode({ description: event.target.value })}
      />
      <h3>Before moving on</h3>
      {node.requirements.map((requirement) => (
        <RequirementEditor
          key={requirement.id}
          requirement={requirement}
          disabled={disabled}
          onChange={(value) =>
            changeNode({
              requirements: node.requirements.map((item) =>
                item.id === value.id ? value : item,
              ),
            })
          }
          onRemove={() =>
            changeNode({
              requirements: node.requirements.filter(
                (item) => item.id !== requirement.id,
              ),
            })
          }
        />
      ))}
      <button
        type="button"
        className="button button-secondary"
        disabled={node.requirements.length >= 30}
        onClick={() =>
          changeNode({
            requirements: [
              ...node.requirements,
              {
                id: `req-${crypto.randomUUID()}`,
                description: '',
                kind: 'requirement',
                applicability: 'always',
              },
            ],
          })
        }
      >
        + Add requirement
      </button>
      <details>
        <summary>Expected outputs</summary>
        <div className="workflow-editor-fields">
          {node.outputs.map((output, index) => (
            <div key={index} className="workflow-output-editor">
              <label className="field-label" htmlFor={`node-output-${index}`}>
                Output {index + 1}
              </label>
              <input
                className="field"
                id={`node-output-${index}`}
                value={output}
                maxLength={2000}
                onChange={(event) =>
                  changeNode({
                    outputs: node.outputs.map((item, itemIndex) =>
                      itemIndex === index ? event.target.value : item,
                    ),
                  })
                }
              />
              <button
                type="button"
                className="button button-destructive"
                aria-label={`Remove output ${index + 1}`}
                onClick={() =>
                  changeNode({
                    outputs: node.outputs.filter(
                      (_, itemIndex) => itemIndex !== index,
                    ),
                  })
                }
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="button button-secondary"
            disabled={node.outputs.length >= 30}
            onClick={() => changeNode({ outputs: [...node.outputs, ''] })}
          >
            + Add output
          </button>
        </div>
      </details>
      <details>
        <summary>Iteration note</summary>
        <label className="field-label" htmlFor="node-iteration">
          Describe repetition within this step
        </label>
        <textarea
          id="node-iteration"
          className="field"
          value={node.iteration_note ?? ''}
          maxLength={2000}
          onChange={(event) =>
            changeNode({ iteration_note: event.target.value })
          }
        />
      </details>
      <h3>Continues to</h3>
      {outgoing.map((edge, index) => (
        <div key={edge.id} className="workflow-edge-editor">
          <label className="field-label" htmlFor={`edge-${edge.id}-target`}>
            Next step {index + 1}
          </label>
          <select
            className="field"
            id={`edge-${edge.id}-target`}
            value={edge.target}
            onChange={(event) =>
              onChange({
                ...graph,
                edges: graph.edges.map((item) =>
                  item.id === edge.id
                    ? { ...item, target: event.target.value }
                    : item,
                ),
              })
            }
          >
            {graph.nodes.map((item) => (
              <option
                key={item.id}
                value={item.id}
                disabled={
                  item.id !== edge.target &&
                  !canConnect(
                    {
                      ...graph,
                      edges: graph.edges.filter(
                        (other) => other.id !== edge.id,
                      ),
                    },
                    node.id,
                    item.id,
                  )
                }
              >
                {item.title || 'Untitled step'}
              </option>
            ))}
          </select>
          <label className="field-label" htmlFor={`edge-${edge.id}-condition`}>
            Transition label {index + 1}
          </label>
          <input
            id={`edge-${edge.id}-condition`}
            className="field"
            value={edge.condition}
            maxLength={160}
            onChange={(event) =>
              onChange({
                ...graph,
                edges: graph.edges.map((item) =>
                  item.id === edge.id
                    ? { ...item, condition: event.target.value }
                    : item,
                ),
              })
            }
          />
          <button
            type="button"
            className="button button-destructive"
            onClick={() =>
              onChange({
                ...graph,
                edges: graph.edges.filter((item) => item.id !== edge.id),
              })
            }
          >
            Remove transition {index + 1}
          </button>
        </div>
      ))}
      {!outgoing.length && (
        <p className="workflow-muted">This is a terminal step.</p>
      )}
      <button
        type="button"
        className="button button-secondary"
        disabled={!candidates.length || graph.edges.length >= 300}
        onClick={() => {
          const target = candidates[0]
          if (target)
            onChange({
              ...graph,
              edges: [
                ...graph.edges,
                {
                  id: `edge-${crypto.randomUUID()}`,
                  source: node.id,
                  target: target.id,
                  condition: 'Requirements met',
                },
              ],
            })
        }}
      >
        + Add transition
      </button>
      <p className="workflow-muted">
        Only forward, cycle-free connections are available. Describe repeated
        work in an iteration note.
      </p>
      <button
        type="button"
        className="button button-destructive"
        disabled={graph.nodes.length <= 1}
        onClick={onRemove}
      >
        Remove step
      </button>
      <p className="workflow-muted">
        Changes apply when you save the workflow.
      </p>
    </fieldset>
  )
}
