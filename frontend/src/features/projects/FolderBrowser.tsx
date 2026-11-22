import { useEffect, useState } from 'react'
import { browseFolders } from './api'
import type { FolderListing } from './api'

export default function FolderBrowser({
  initialPath,
  onChoose,
  onCancel,
}: {
  initialPath?: string
  onChoose: (path: string) => void
  onCancel: () => void
}) {
  const [listing, setListing] = useState<FolderListing | null>(null)
  const [path, setPath] = useState(initialPath ?? '')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [destination, setDestination] = useState({ path: initialPath })

  function navigate(path?: string) {
    setLoading(true)
    setError('')
    setDestination({ path })
  }

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

  return (
    <section
      className="folder-browser"
      aria-label="Browse local folders"
      aria-busy={loading}
    >
      <label htmlFor="browse-folder-path">Browse folders on this machine</label>
      <div className="project-input-row">
        <input
          id="browse-folder-path"
          disabled={loading}
          value={path}
          onChange={(event) => setPath(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void navigate(path.trim() || undefined)
            }
          }}
          placeholder="Enter a folder path"
        />
        <button
          type="button"
          className="secondary-button"
          disabled={loading}
          onClick={() => navigate(path.trim() || undefined)}
        >
          Go
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="project-hint" role="status">
          Loading folders…
        </p>
      ) : (
        <>
          {listing?.parent && (
            <button
              type="button"
              className="text-button"
              onClick={() => navigate(listing.parent!)}
            >
              ↑ Parent folder
            </button>
          )}
          <div className="folder-list">
            {listing?.folders.map((folder) => (
              <button
                type="button"
                className="folder-row"
                key={folder.path}
                onClick={() => navigate(folder.path)}
              >
                <span aria-hidden="true">▱</span> {folder.name}{' '}
                <span aria-hidden="true">›</span>
              </button>
            ))}
            {listing && listing.folders.length === 0 && (
              <p className="project-hint">No subfolders.</p>
            )}
          </div>
        </>
      )}
      <div className="project-panel-actions">
        <button type="button" className="secondary-button" onClick={onCancel}>
          Cancel browsing
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={loading || Boolean(error) || !listing}
          onClick={() => listing && onChoose(listing.path)}
        >
          Use this folder
        </button>
      </div>
    </section>
  )
}
