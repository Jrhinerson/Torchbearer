import { useEffect, useRef, useState } from 'react'
import { addProject, listProjects, removeProject, renameProject } from './api'
import type { Project } from './api'
import FolderBrowser from './FolderBrowser'

type View = 'closed' | 'choose' | 'add' | 'manage'

export default function ProjectPicker({
  selected,
  onSelect,
  onProjectChange,
  onBusyChange,
  disabled,
}: {
  selected: Project | null
  onSelect: (project: Project | null) => void
  onProjectChange: (project: Project) => void
  onBusyChange: (busy: boolean) => void
  disabled: boolean
}) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [view, setView] = useState<View>('closed')
  const [query, setQuery] = useState('')
  const [source, setSource] = useState<'local' | 'clone'>('local')
  const [path, setPath] = useState('')
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [browsing, setBrowsing] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [rename, setRename] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const trigger = useRef<HTMLButtonElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const pathInput = useRef<HTMLInputElement>(null)
  const urlInput = useRef<HTMLInputElement>(null)
  const blocked = disabled || busy

  useEffect(() => {
    const controller = new AbortController()
    listProjects(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setProjects(result)
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setLoadError(
            error instanceof Error ? error.message : 'Could not load projects.',
          )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [reload])

  useEffect(() => {
    if (view === 'choose') searchInput.current?.focus()
    if (view === 'add') {
      if (source === 'local') pathInput.current?.focus()
      else urlInput.current?.focus()
    }
  }, [view, source, browsing])

  const matches = projects
    .filter((project) =>
      `${project.name} ${project.path}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase().trim()),
    )
    .sort((left, right) => left.name.localeCompare(right.name))

  function changeView(next: View) {
    setError('')
    setBrowsing(false)
    setEditing(null)
    setView(next)
    if (next === 'closed') trigger.current?.focus()
  }

  function select(project: Project | null) {
    onSelect(project)
    setQuery('')
    changeView('closed')
  }

  async function run(action: () => Promise<void>) {
    if (blocked) return
    setError('')
    setBusy(true)
    onBusyChange(true)
    try {
      await action()
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Could not update projects.',
      )
    } finally {
      setBusy(false)
      onBusyChange(false)
      // The trigger becomes enabled after the operation's state updates render.
      requestAnimationFrame(() => trigger.current?.focus())
    }
  }

  function handleAdd() {
    void run(async () => {
      const project = await addProject({
        source,
        path: path.trim(),
        ...(name.trim() && { name: name.trim() }),
        ...(source === 'clone' && { url: url.trim() }),
      })
      setProjects((current) => [
        ...current.filter((item) => item.id !== project.id),
        project,
      ])
      onProjectChange(project)
      select(project)
      setPath('')
      setUrl('')
      setName('')
    })
  }

  return (
    <div
      className="project-field"
      onKeyDown={(event) => {
        if (view !== 'closed' && event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          if (!busy) changeView('closed')
        }
        // Project fields must never submit the surrounding task form.
        if (event.key === 'Enter' && event.target instanceof HTMLInputElement)
          event.preventDefault()
      }}
    >
      <label
        className="field-label"
        id="task-project-label"
        htmlFor="task-project"
      >
        Project <span className="optional">optional</span>
      </label>
      <button
        id="task-project"
        aria-busy={busy}
        ref={trigger}
        type="button"
        className="button button-secondary project-trigger"
        aria-labelledby="task-project-label task-project-value"
        aria-expanded={view !== 'closed'}
        aria-controls={view === 'closed' ? undefined : 'project-panel'}
        disabled={blocked}
        onClick={() => changeView(view === 'closed' ? 'choose' : 'closed')}
      >
        <span className="project-icon" aria-hidden="true">
          ▱
        </span>
        <span className="project-summary">
          <span id="task-project-value">
            {selected?.name ?? 'Select a project'}
          </span>
          <span className="project-path">
            {selected?.path ?? 'Choose a saved project or add one'}
          </span>
        </span>
        <span aria-hidden="true">{view === 'closed' ? '⌄' : '⌃'}</span>
      </button>
      {loadError && (
        <div className="feedback feedback-error form-error" role="alert">
          {loadError}{' '}
          <button
            type="button"
            className="button button-link"
            onClick={() => {
              setLoading(true)
              setLoadError('')
              setReload((value) => value + 1)
            }}
          >
            Retry projects
          </button>
        </div>
      )}
      {view !== 'closed' && (
        <section
          id="project-panel"
          className="project-panel"
          aria-label="Project picker"
        >
          {view === 'choose' && (
            <>
              <label className="sr-only" htmlFor="project-search">
                Search projects
              </label>
              <input
                className="field"
                id="project-search"
                ref={searchInput}
                type="search"
                value={query}
                disabled={blocked}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by project name or folder…"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && matches.length > 0) {
                    event.preventDefault()
                    select(matches[0])
                  }
                }}
              />
              <div className="project-list" aria-label="Saved projects">
                <button
                  type="button"
                  className="button button-quiet project-option"
                  aria-pressed={!selected}
                  disabled={blocked}
                  onClick={() => select(null)}
                >
                  <span className="project-summary">
                    <span>No project</span>
                    <span className="project-path">
                      Keep this task unassigned
                    </span>
                  </span>
                  {!selected && <span aria-hidden="true">✓</span>}
                </button>
                {loading && (
                  <p className="project-hint" role="status">
                    Loading projects…
                  </p>
                )}
                {matches.map((project) => (
                  <button
                    type="button"
                    key={project.id}
                    className="button button-quiet project-option"
                    aria-label={`Select ${project.name}`}
                    aria-pressed={selected?.id === project.id}
                    disabled={blocked}
                    onClick={() => select(project)}
                  >
                    <span className="project-summary">
                      <span>{project.name}</span>
                      <span className="project-path">{project.path}</span>
                    </span>
                    {selected?.id === project.id && (
                      <span aria-hidden="true">✓</span>
                    )}
                  </button>
                ))}
                {!loading && !loadError && matches.length === 0 && (
                  <p className="project-hint">
                    {projects.length
                      ? 'No projects match your search.'
                      : 'No saved projects yet. Add a folder or clone a repository.'}
                  </p>
                )}
              </div>
              <div className="project-picker-actions">
                <button
                  type="button"
                  className="button button-link"
                  disabled={blocked}
                  onClick={() => changeView('add')}
                >
                  + Add Project
                </button>
                <button
                  type="button"
                  className="button button-link"
                  disabled={blocked || projects.length === 0}
                  onClick={() => changeView('manage')}
                >
                  Manage projects
                </button>
              </div>
            </>
          )}
          {view === 'add' && (
            <>
              <div className="project-panel-heading">
                <strong>Add project</strong>
                <button
                  type="button"
                  className="button button-link"
                  disabled={blocked}
                  onClick={() => changeView('choose')}
                >
                  Back to projects
                </button>
              </div>
              <div className="project-sources" aria-label="Project source">
                <button
                  type="button"
                  className="button button-secondary"
                  aria-pressed={source === 'local'}
                  disabled={blocked}
                  onClick={() => {
                    setSource('local')
                    setPath('')
                    setBrowsing(false)
                    setError('')
                  }}
                >
                  Local folder
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  aria-pressed={source === 'clone'}
                  disabled={blocked}
                  onClick={() => {
                    setSource('clone')
                    setPath('')
                    setBrowsing(false)
                    setError('')
                  }}
                >
                  Clone a Git URL
                </button>
              </div>
              {source === 'clone' && (
                <>
                  <label className="field-label" htmlFor="project-url">
                    Git URL
                  </label>
                  <input
                    className="field"
                    id="project-url"
                    ref={urlInput}
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="https://github.com/owner/repo.git"
                    disabled={blocked}
                    maxLength={2048}
                  />
                </>
              )}
              <label className="field-label" htmlFor="project-path">
                {source === 'local' ? 'Local folder path' : 'Clone destination'}
              </label>
              <div className="project-input-row">
                <input
                  className="field"
                  id="project-path"
                  ref={pathInput}
                  value={path}
                  onChange={(event) => setPath(event.target.value)}
                  placeholder={
                    source === 'local'
                      ? 'Paste an absolute folder path'
                      : 'Full path to a new folder'
                  }
                  disabled={blocked}
                  maxLength={4096}
                />
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={blocked}
                  onClick={() => setBrowsing((current) => !current)}
                >
                  {source === 'local' ? 'Browse' : 'Browse parent'}
                </button>
              </div>
              {browsing && (
                <FolderBrowser
                  onCancel={() => setBrowsing(false)}
                  onChoose={(folder) => {
                    const repoName =
                      url
                        .split(/[/:]/)
                        .filter(Boolean)
                        .at(-1)
                        ?.replace(/\.git$/, '') || 'repository'
                    setPath(
                      source === 'local'
                        ? folder
                        : `${folder.replace(/[\\/]$/, '')}${folder.includes('\\') ? '\\' : '/'}${repoName}`,
                    )
                    setBrowsing(false)
                  }}
                />
              )}
              <p className="project-hint">
                {source === 'local'
                  ? 'Use an existing folder on the machine running Torchbearer.'
                  : 'The parent folder must exist. Git uses this machine’s credentials; cloning can take up to two minutes.'}
              </p>
              <label className="field-label" htmlFor="project-name">
                Project name{' '}
                <span className="optional">defaults to folder name</span>
              </label>
              <input
                className="field"
                id="project-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Optional display name"
                maxLength={200}
                disabled={blocked}
              />
              <div className="project-panel-actions">
                <button
                  type="button"
                  className="button button-primary"
                  disabled={
                    blocked ||
                    !path.trim() ||
                    (source === 'clone' && !url.trim())
                  }
                  onClick={handleAdd}
                >
                  {busy
                    ? source === 'clone'
                      ? 'Cloning repository…'
                      : 'Adding project…'
                    : source === 'clone'
                      ? 'Clone and select project'
                      : 'Add and select project'}
                </button>
              </div>
            </>
          )}
          {view === 'manage' && (
            <>
              <div className="project-panel-heading">
                <strong>Manage projects</strong>
                <button
                  type="button"
                  className="button button-link"
                  disabled={blocked}
                  onClick={() => changeView('choose')}
                >
                  Back to projects
                </button>
              </div>
              <p className="project-hint">
                Removing a project keeps its files and existing tasks.
              </p>
              <div className="project-list">
                {projects.map((project) => (
                  <div className="managed-project" key={project.id}>
                    <div className="project-summary">
                      <strong>{project.name}</strong>
                      <span className="project-path">{project.path}</span>
                    </div>
                    {editing === project.id ? (
                      <>
                        <label className="sr-only" htmlFor="rename-project">
                          New project name
                        </label>
                        <input
                          className="field"
                          id="rename-project"
                          value={rename}
                          onChange={(event) => setRename(event.target.value)}
                          disabled={blocked}
                          maxLength={200}
                          autoFocus
                        />
                        <div className="project-row-actions">
                          <button
                            type="button"
                            className="button button-link"
                            disabled={blocked || !rename.trim()}
                            onClick={() =>
                              run(async () => {
                                const updated = await renameProject(
                                  project.id,
                                  rename.trim(),
                                )
                                setProjects((current) =>
                                  current.map((item) =>
                                    item.id === updated.id ? updated : item,
                                  ),
                                )
                                if (selected?.id === updated.id)
                                  onSelect(updated)
                                onProjectChange(updated)
                                setEditing(null)
                              })
                            }
                          >
                            {busy ? 'Saving…' : 'Save name'}
                          </button>
                          <button
                            type="button"
                            className="button button-link"
                            disabled={blocked}
                            onClick={() => setEditing(null)}
                          >
                            Cancel rename
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="project-row-actions">
                        <button
                          type="button"
                          className="button button-link"
                          aria-label={`Rename ${project.name}`}
                          disabled={blocked}
                          onClick={() => {
                            setEditing(project.id)
                            setRename(project.name)
                            setError('')
                          }}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className="button button-link button-destructive remove-project-button"
                          aria-label={`Remove ${project.name}`}
                          disabled={blocked}
                          onClick={() => {
                            if (
                              !window.confirm(
                                `Remove "${project.name}" from saved projects? Its files and existing tasks will be kept.`,
                              )
                            )
                              return
                            void run(async () => {
                              await removeProject(project.id)
                              setProjects((current) =>
                                current.filter(
                                  (item) => item.id !== project.id,
                                ),
                              )
                              if (selected?.id === project.id) onSelect(null)
                              onProjectChange({ ...project, archived: true })
                            })
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {projects.length === 0 && (
                  <p className="project-hint">No saved projects.</p>
                )}
              </div>
            </>
          )}
          {error && (
            <p className="feedback feedback-error form-error" role="alert">
              {error}
            </p>
          )}
          {busy && (
            <p className="sr-only" role="status">
              Updating projects. Please wait.
            </p>
          )}
        </section>
      )}
    </div>
  )
}
