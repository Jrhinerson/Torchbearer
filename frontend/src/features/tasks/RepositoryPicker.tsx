import { useId, useState } from 'react'
import { addRepository } from './api'
import type { Repository } from './api'

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
      <label className="field-label" htmlFor={id}>
        Repository
      </label>
      <select
        className="field"
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
        className="button button-link"
        disabled={disabled || saving}
        onClick={() => setAdding(!adding)}
      >
        {adding ? 'Cancel adding repository' : 'Add repository'}
      </button>
      {adding && (
        <div className="add-repository">
          <label className="field-label" htmlFor={`${id}-path`}>
            Local Git repository path
          </label>
          <input
            className="field"
            id={`${id}-path`}
            value={path}
            disabled={disabled || saving}
            onChange={(event) => setPath(event.target.value)}
            placeholder="Full path to a Git repository"
          />
          <button
            type="button"
            className="button button-secondary"
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
        <p role="alert" className="feedback feedback-error form-error">
          {error}
        </p>
      )}
    </div>
  )
}
