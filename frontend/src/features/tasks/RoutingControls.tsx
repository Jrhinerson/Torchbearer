import { useId, useState } from 'react'
import { addRepository, assignAgent } from './api'
import type { Agent, Repository, Routing, Stage } from './api'

export function AgentSelect({
  stage,
  routing,
  onChange,
}: {
  stage: Stage
  routing: Routing
  onChange: (stage: Stage, agent: Agent | '') => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  return (
    <div className="column-agent">
      <label className="sr-only" htmlFor={`${stage}-agent`}>
        Agent for {stage}
      </label>
      <select
        id={`${stage}-agent`}
        value={routing.assignments[stage]}
        disabled={saving}
        onChange={async (event) => {
          const agent = event.target.value as Agent | ''
          setSaving(true)
          setError('')
          try {
            await assignAgent(stage, agent)
            onChange(stage, agent)
          } catch (cause) {
            setError(
              cause instanceof Error ? cause.message : 'Could not save agent.',
            )
          } finally {
            setSaving(false)
          }
        }}
      >
        <option value="">Unassigned</option>
        {routing.agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.label}
            {agent.available ? '' : ' (not installed)'}
          </option>
        ))}
      </select>
      {saving && <span role="status">Saving…</span>}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </div>
  )
}

export function RepositoryPicker({
  repositories,
  value,
  onChange,
  onAdded,
  disabled = false,
}: {
  repositories: Repository[]
  value: string
  onChange: (id: string) => void
  onAdded: (repository: Repository) => void
  disabled?: boolean
}) {
  const id = useId()
  const [adding, setAdding] = useState(false)
  const [path, setPath] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  return (
    <div className="repository-picker">
      <label htmlFor={id}>Repository</label>
      <select
        id={id}
        value={value}
        disabled={disabled || saving}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Choose before starting planning</option>
        {repositories.map((repository) => (
          <option key={repository.id} value={repository.id}>
            {repository.name} — {repository.path}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="text-button"
        disabled={disabled || saving}
        onClick={() => setAdding(!adding)}
      >
        {adding ? 'Cancel adding repository' : 'Add repository'}
      </button>
      {adding && (
        <div className="add-repository">
          <label htmlFor={`${id}-path`}>Local Git repository path</label>
          <input
            id={`${id}-path`}
            value={path}
            disabled={disabled || saving}
            onChange={(event) => setPath(event.target.value)}
            placeholder="Full path to a Git repository"
          />
          <button
            type="button"
            className="secondary-button"
            disabled={disabled || saving || !path.trim()}
            onClick={async () => {
              setSaving(true)
              setError('')
              try {
                const repository = await addRepository(path.trim())
                onAdded(repository)
                onChange(repository.id)
                setPath('')
                setAdding(false)
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : 'Could not add repository.',
                )
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving ? 'Checking…' : 'Use repository'}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </div>
  )
}
