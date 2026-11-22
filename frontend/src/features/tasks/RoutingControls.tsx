import { useEffect, useId, useRef, useState } from 'react'
import chatgptLogo from '../../assets/agents/chatgpt.svg'
import claudeLogo from '../../assets/agents/claude.svg'
import piLogo from '../../assets/agents/pi.svg'
import { addRepository, assignAgent } from './api'
import type { Agent, Repository, Routing, Stage } from './api'

const agentLogos: Record<Agent, string> = {
  codex: chatgptLogo,
  claude: claudeLogo,
  pi: piLogo,
}

const agentNames: Record<Agent, string> = {
  codex: 'codex',
  claude: 'claude code',
  pi: 'Pi',
}

function AgentLabel({
  agent,
}: {
  agent: { id: Agent | ''; label: string; available: boolean }
}) {
  return (
    <span className="agent-label">
      <span className="agent-name">
        {agent.id && (
          <img
            className={`agent-logo agent-logo-${agent.id}`}
            src={agentLogos[agent.id]}
            alt=""
            aria-hidden="true"
          />
        )}
        <span>{agent.label}</span>
      </span>
      {!agent.available && <small>Not installed</small>}
    </span>
  )
}

export function AgentSelect({
  stage,
  routing,
  onChange,
}: {
  stage: Stage
  routing: Routing
  onChange: (stage: Stage, agent: Agent | '') => void
}) {
  const id = useId()
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const typeahead = useRef({ text: '', time: 0 })
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const choices: { id: Agent | ''; label: string; available: boolean }[] = [
    { id: '', label: 'Unassigned', available: true },
    ...routing.agents.map((agent) => ({
      ...agent,
      label: agentNames[agent.id],
    })),
  ]
  const selectedIndex = Math.max(
    0,
    choices.findIndex((agent) => agent.id === routing.assignments[stage]),
  )

  useEffect(() => {
    if (!open) return
    function dismiss(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [open])

  function showOptions(index = selectedIndex) {
    setActiveIndex(index)
    setOpen(true)
    typeahead.current = { text: '', time: 0 }
  }

  async function selectAgent(agent: Agent | '') {
    setOpen(false)
    trigger.current?.focus()
    if (agent === routing.assignments[stage]) return
    setSaving(true)
    setError('')
    try {
      await assignAgent(stage, agent)
      onChange(stage, agent)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save agent.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="column-agent"
      ref={container}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      <span className="sr-only" id={`${id}-label`}>
        Agent for {stage}
      </span>
      <button
        ref={trigger}
        type="button"
        className="agent-select"
        role="combobox"
        aria-labelledby={`${id}-label`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-options` : undefined}
        aria-activedescendant={open ? `${id}-option-${activeIndex}` : undefined}
        aria-busy={saving}
        aria-disabled={saving}
        onClick={() => {
          if (!saving) {
            if (open) setOpen(false)
            else showOptions()
          }
        }}
        onKeyDown={(event) => {
          if (saving && event.key !== 'Tab') {
            event.preventDefault()
            return
          }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            if (!open) showOptions()
            else
              setActiveIndex((index) =>
                Math.max(
                  0,
                  Math.min(
                    choices.length - 1,
                    index + (event.key === 'ArrowDown' ? 1 : -1),
                  ),
                ),
              )
          } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault()
            showOptions(event.key === 'Home' ? 0 : choices.length - 1)
          } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            if (open) void selectAgent(choices[activeIndex].id)
            else showOptions()
          } else if (event.key === 'Escape' || event.key === 'Tab') {
            if (open && event.key === 'Escape') event.preventDefault()
            setOpen(false)
          } else if (
            event.key.length === 1 &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey
          ) {
            event.preventDefault()
            const now = Date.now()
            const text =
              (now - typeahead.current.time < 700
                ? typeahead.current.text
                : '') + event.key.toLowerCase()
            typeahead.current = { text, time: now }
            const match = choices.findIndex((agent) =>
              agent.label.toLowerCase().startsWith(text),
            )
            if (match >= 0) {
              setActiveIndex(match)
              setOpen(true)
            }
          }
        }}
      >
        <AgentLabel agent={choices[selectedIndex]} />
        <svg
          className="agent-chevron"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="m3 4.5 3 3 3-3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <ul
          id={`${id}-options`}
          role="listbox"
          aria-labelledby={`${id}-label`}
          className="agent-options"
          onPointerDown={(event) => event.preventDefault()}
        >
          {choices.map((agent, index) => (
            <li
              key={agent.id}
              id={`${id}-option-${index}`}
              role="option"
              aria-selected={index === selectedIndex}
              className={
                index === activeIndex ? 'agent-option active' : 'agent-option'
              }
              onPointerMove={() => setActiveIndex(index)}
              onClick={() => void selectAgent(agent.id)}
            >
              <AgentLabel agent={agent} />
            </li>
          ))}
        </ul>
      )}
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
