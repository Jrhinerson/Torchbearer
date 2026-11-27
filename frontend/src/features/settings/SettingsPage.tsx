import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../../lib/api'
import {
  cancelGitHub,
  connectGitHub,
  disconnectGitHub,
  getGitHubConnection,
  githubVerificationUrl,
  pollGitHub,
  verifyGitHubConnection,
} from './api'
import type { GitHubConnection } from './api'

type Action = 'connect' | 'cancel' | 'disconnect' | 'verify'

export default function SettingsPage() {
  const [connection, setConnection] = useState<GitHubConnection | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<Action | null>(null)
  const [copied, setCopied] = useState(false)
  const [reload, setReload] = useState(0)
  const browser = useRef<Window | null>(null)
  const account = connection?.account
  const authorization = connection?.authorization
  const authorizationId = authorization?.id
  const pending = authorization?.state === 'pending'

  useEffect(() => {
    const controller = new AbortController()
    getGitHubConnection(controller.signal)
      .then(async (result) => {
        if (controller.signal.aborted) return
        setConnection(result)
        setError('')
        if (
          result.available &&
          result.account &&
          !result.account.reauthorization_required &&
          result.authorization?.state !== 'pending'
        ) {
          setBusy('verify')
          try {
            const verified = await verifyGitHubConnection(controller.signal)
            if (!controller.signal.aborted) setConnection(verified)
          } finally {
            if (!controller.signal.aborted) setBusy(null)
          }
        }
      })
      .catch((cause: Error) => {
        if (!controller.signal.aborted) setError(cause.message)
      })
    return () => controller.abort()
  }, [reload])

  useEffect(() => {
    if (!pending || !authorizationId || busy) return
    const controller = new AbortController()
    let timer: number
    async function check() {
      try {
        let result: GitHubConnection
        try {
          result = await pollGitHub(authorizationId!, controller.signal)
        } catch (cause) {
          // A backend restart or another tab may have ended this attempt.
          if (!(cause instanceof ApiError) || cause.status !== 409) throw cause
          result = await getGitHubConnection(controller.signal)
        }
        if (controller.signal.aborted) return
        setConnection(result)
        setError('')
        if (result.authorization?.state === 'pending')
          timer = window.setTimeout(
            check,
            Math.max(1000, result.authorization.poll_after * 1000),
          )
      } catch (cause) {
        if (controller.signal.aborted) return
        setError((cause as Error).message)
        timer = window.setTimeout(check, 5000)
      }
    }
    timer = window.setTimeout(check, 500)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [authorizationId, pending, busy])

  useEffect(() => {
    if (
      pending &&
      authorization?.user_code &&
      authorization.verification_url === githubVerificationUrl &&
      browser.current
    ) {
      if (!browser.current.closed)
        browser.current.location.replace(githubVerificationUrl)
      browser.current = null
    }
    if (!pending && browser.current) {
      browser.current.close()
      browser.current = null
    }
  }, [pending, authorization?.user_code, authorization?.verification_url])

  useEffect(
    () => () => {
      // Only close our temporary loading tab, never a GitHub tab handed to the user.
      browser.current?.close()
      browser.current = null
    },
    [],
  )

  async function act(action: Action) {
    if (action === 'connect') {
      // Reserve a tab during the click so popup blockers cannot block the async handoff.
      browser.current = window.open('about:blank', '_blank')
      if (browser.current) {
        browser.current.opener = null
        browser.current.document.title = 'Connecting to GitHub'
        browser.current.document.body.textContent =
          'Preparing GitHub sign-in. Your one-time code will appear in Torchbearer Settings.'
      }
    }
    setBusy(action)
    setError('')
    setCopied(false)
    try {
      const result =
        action === 'connect'
          ? await connectGitHub()
          : action === 'cancel'
            ? await cancelGitHub(authorization!.id)
            : action === 'verify'
              ? await verifyGitHubConnection()
              : await disconnectGitHub()
      setConnection(result)
    } catch (cause) {
      setError((cause as Error).message)
      browser.current?.close()
      browser.current = null
    } finally {
      setBusy(null)
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(authorization!.user_code)
      setCopied(true)
    } catch {
      setError('Could not copy the code. Select and copy it manually.')
    }
  }

  return (
    <section className="settings-page" aria-labelledby="settings-heading">
      <h1 id="settings-heading">Settings</h1>
      <section
        className="connections-section"
        aria-labelledby="connections-heading"
      >
        <header className="settings-section-header">
          <h2 id="connections-heading">Connections</h2>
          <p>Connect the accounts you use for your work.</p>
        </header>
        <article
          className="surface connection-card"
          aria-labelledby="github-heading"
        >
          <div className="connection-header">
            <svg
              className="connection-icon"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 .75a11.25 11.25 0 0 0-3.56 21.92c.56.1.77-.24.77-.54v-2.1c-3.13.68-3.79-1.33-3.79-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.69.08-.69 1.13.08 1.73 1.16 1.73 1.16 1 1.72 2.64 1.22 3.28.93.1-.73.4-1.22.71-1.5-2.5-.29-5.13-1.25-5.13-5.56 0-1.23.44-2.23 1.16-3.02-.12-.28-.5-1.43.11-2.98 0 0 .95-.3 3.1 1.15a10.8 10.8 0 0 1 5.63 0c2.15-1.46 3.09-1.15 3.09-1.15.61 1.55.23 2.7.11 2.98.72.79 1.16 1.8 1.16 3.02 0 4.32-2.63 5.27-5.14 5.55.4.35.76 1.03.76 2.08v3.1c0 .3.2.65.78.54A11.25 11.25 0 0 0 12 .75Z" />
            </svg>
            <div className="connection-heading">
              <h3 id="github-heading">GitHub</h3>
              <p>
                Choose a GitHub account and authorize access in your browser.
              </p>
            </div>
            <span className="badge">
              {account?.reauthorization_required
                ? 'Sign-in required'
                : account
                  ? 'Connected'
                  : 'Not connected'}
            </span>
          </div>

          {account && (
            <div className="connection-account">
              <span className="connection-status-dot" aria-hidden="true" />
              <div>
                <a
                  href={`https://github.com/${account.login}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  @{account.login}
                </a>
                {account.name && <p>{account.name}</p>}
              </div>
            </div>
          )}

          {!connection && !error && <p role="status">Loading connections…</p>}
          {account?.reauthorization_required && (
            <p className="feedback feedback-info">
              Authorize this account for Torchbearer to reconnect.
            </p>
          )}
          {connection && !connection.available && (
            <div className="feedback feedback-info">
              <p>{connection.unavailable_reason}</p>
              <button
                className="button button-link"
                onClick={() => setReload((value) => value + 1)}
              >
                Reload connections
              </button>
            </div>
          )}

          {pending && (
            <div
              className="feedback feedback-info github-authorization"
              role="status"
            >
              {authorization.user_code ? (
                <>
                  <p>
                    Enter this one-time code in the GitHub tab, then authorize
                    the account you want to connect.
                  </p>
                  <div className="github-code-row">
                    <code className="github-device-code">
                      {authorization.user_code}
                    </code>
                    <button
                      className="button button-secondary"
                      onClick={copyCode}
                    >
                      {copied ? 'Copied' : 'Copy code'}
                    </button>
                  </div>
                  <a
                    className="button button-secondary"
                    href={githubVerificationUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Continue on GitHub
                  </a>
                  <p>
                    Waiting for authorization…
                    {authorization.expires_at && (
                      <>
                        {' '}
                        Code expires at{' '}
                        <time dateTime={authorization.expires_at}>
                          {new Date(
                            authorization.expires_at,
                          ).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </time>
                        .
                      </>
                    )}
                  </p>
                </>
              ) : (
                <p>Requesting a GitHub sign-in code…</p>
              )}
              <button
                className="button button-quiet"
                disabled={busy !== null}
                aria-busy={busy === 'cancel'}
                onClick={() => act('cancel')}
              >
                {busy === 'cancel' ? 'Cancelling…' : 'Cancel sign-in'}
              </button>
            </div>
          )}

          {authorization?.error && (
            <p
              className={`feedback ${pending ? 'feedback-warning' : 'feedback-error'}`}
              role="alert"
            >
              {authorization.error}
            </p>
          )}
          {error && (
            <div className="feedback feedback-error" role="alert">
              <p>{error}</p>
              {!connection && (
                <button
                  className="button button-secondary"
                  onClick={() => setReload((value) => value + 1)}
                >
                  Try again
                </button>
              )}
            </div>
          )}

          <div className="connection-actions">
            {account && !account.reauthorization_required && !pending && (
              <button
                className="button button-quiet"
                disabled={busy !== null || !connection?.available}
                aria-busy={busy === 'verify'}
                onClick={() => act('verify')}
              >
                {busy === 'verify'
                  ? 'Checking connection…'
                  : 'Check connection'}
              </button>
            )}
            {!pending && (
              <button
                className="button button-primary"
                disabled={!connection?.available || busy !== null}
                aria-busy={busy === 'connect'}
                onClick={() => act('connect')}
              >
                {busy === 'connect'
                  ? 'Starting sign-in…'
                  : account?.reauthorization_required
                    ? 'Reconnect GitHub'
                    : account
                      ? 'Change account'
                      : 'Connect GitHub'}
              </button>
            )}
            {account && (
              <button
                className="button button-secondary"
                disabled={busy !== null}
                aria-busy={busy === 'disconnect'}
                onClick={() => act('disconnect')}
              >
                {busy === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}
              </button>
            )}
          </div>
        </article>
      </section>
    </section>
  )
}
