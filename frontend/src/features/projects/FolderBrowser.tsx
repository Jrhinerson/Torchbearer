import { useEffect, useRef, useState } from 'react'
import { browseFolders } from './api'
import type { FolderListing } from './api'

export default function FolderBrowser({
  initialPath,
  onChoose,
  onCancel,
  onClone,
}: {
  initialPath?: string
  onChoose: (path: string) => void
  onCancel: () => void
  onClone?: () => void
}) {
  const [listing, setListing] = useState<FolderListing | null>(null)
  const [path, setPath] = useState(initialPath ?? '')
  const [query, setQuery] = useState('')
  const [enteringPath, setEnteringPath] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [destination, setDestination] = useState({ path: initialPath })
  const filterInput = useRef<HTMLInputElement>(null)
  const pathInput = useRef<HTMLInputElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)

  function navigate(path?: string) {
    setLoading(true)
    setError('')
    setQuery('')
    setDestination({ path })
  }

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    filterInput.current?.focus()
    return () => element?.close()
  }, [])

  useEffect(() => {
    if (enteringPath) pathInput.current?.focus()
  }, [enteringPath])

  useEffect(() => {
    const controller = new AbortController()
    browseFolders(destination.path, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setListing(result)
          setPath(result.path)
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : 'Could not open this folder.',
          )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [destination])

  const folders = listing?.folders.filter((folder) =>
    folder.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  )

  return (
    <dialog
      ref={dialog}
      className="surface surface-overlay folder-browser-dialog"
      aria-label="Choose a local folder"
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
    >
      <section
        className="folder-browser"
        aria-label="Browse local folders"
        aria-busy={loading}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            onCancel()
          }
        }}
      >
        <div className="folder-toolbar">
          <strong>Choose a local folder</strong>
          {onClone && (
            <button
              type="button"
              className="button button-link"
              onClick={onClone}
            >
              Clone a Git URL
            </button>
          )}
        </div>
        <p className="project-hint">
          Open a folder or Git repository, then use it for your project.
        </p>
        <nav className="folder-locations" aria-label="Folder locations">
          {listing ? (
            listing.locations.map((location) => (
              <button
                key={location.path}
                type="button"
                className="button button-secondary"
                disabled={loading}
                onClick={() => navigate(location.path)}
                title={location.path}
              >
                {location.name}
              </button>
            ))
          ) : (
            <button
              type="button"
              className="button button-secondary"
              disabled={loading}
              onClick={() => navigate()}
            >
              Home
            </button>
          )}
        </nav>
        {listing && (
          <nav className="folder-breadcrumbs" aria-label="Folder breadcrumbs">
            {listing.breadcrumbs.map((part, index) => (
              <span key={part.path}>
                {index > 0 && <span aria-hidden="true"> / </span>}
                <button
                  type="button"
                  className="button button-quiet"
                  aria-current={
                    part.path === listing.path ? 'location' : undefined
                  }
                  disabled={loading}
                  title={part.path}
                  onClick={() => navigate(part.path)}
                >
                  {part.name}
                </button>
              </span>
            ))}
          </nav>
        )}
        <div className="folder-toolbar">
          <button
            type="button"
            className="button button-secondary"
            disabled={loading || !listing?.parent}
            onClick={() => listing?.parent && navigate(listing.parent)}
          >
            ↑ Parent folder
          </button>
          <button
            type="button"
            className="button button-link"
            aria-expanded={enteringPath}
            aria-controls={enteringPath ? 'folder-path-entry' : undefined}
            onClick={() => setEnteringPath((current) => !current)}
          >
            {enteringPath ? 'Hide path entry' : 'Enter a path'}
          </button>
        </div>
        {enteringPath && (
          <div id="folder-path-entry">
            <label className="field-label" htmlFor="browse-folder-path">
              Browse folders on this machine
            </label>
            <div className="project-input-row">
              <input
                className="field"
                id="browse-folder-path"
                ref={pathInput}
                disabled={loading}
                value={path}
                onChange={(event) => setPath(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    navigate(path.trim() || undefined)
                  }
                }}
                placeholder="Enter a folder path"
                maxLength={4096}
              />
              <button
                type="button"
                className="button button-secondary"
                disabled={loading}
                onClick={() => navigate(path.trim() || undefined)}
              >
                Go
              </button>
            </div>
          </div>
        )}
        <label className="sr-only" htmlFor="folder-filter">
          Filter folders
        </label>
        <input
          id="folder-filter"
          className="field folder-filter"
          type="search"
          ref={filterInput}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter folders in this location…"
        />
        {error && (
          <div className="feedback feedback-error form-error" role="alert">
            {error}{' '}
            <button
              type="button"
              className="button button-link"
              onClick={() => navigate(destination.path)}
            >
              Retry folder
            </button>
          </div>
        )}
        <div className="folder-list" aria-label="Folders">
          {loading ? (
            <p className="project-hint" role="status">
              Loading folders…
            </p>
          ) : !error ? (
            <>
              {folders?.map((folder) => (
                <button
                  type="button"
                  className="button button-quiet folder-row"
                  key={folder.path}
                  aria-label={`Open ${folder.name}`}
                  onClick={() => {
                    navigate(folder.path)
                    filterInput.current?.focus()
                  }}
                >
                  <span aria-hidden="true">▱</span>
                  <span className="folder-name">{folder.name}</span>
                  {folder.is_repository && (
                    <span className="badge">Git repository</span>
                  )}
                  <span aria-hidden="true">›</span>
                </button>
              ))}
              {listing && folders?.length === 0 && (
                <p className="project-hint" role="status">
                  {listing.folders.length
                    ? 'No folders match your filter.'
                    : 'No subfolders. You can use this folder.'}
                </p>
              )}
            </>
          ) : null}
        </div>
        {listing && !loading && !error && (
          <div className="folder-current" role="status">
            <span>
              {listing.is_repository ? 'Git repository' : 'Current folder'}
            </span>
            <span className="folder-current-path">{listing.path}</span>
          </div>
        )}
        <div className="project-panel-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={onCancel}
          >
            Cancel browsing
          </button>
          <button
            type="button"
            className="button button-primary"
            disabled={loading || Boolean(error) || !listing}
            onClick={() => listing && onChoose(listing.path)}
          >
            Use this folder
          </button>
        </div>
      </section>
    </dialog>
  )
}
