import { useEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import Board from '../features/tasks/Board'
import WorkflowsPage from '../features/workflows/WorkflowsPage'
import SettingsPage from '../features/settings/SettingsPage'

const pages = [
  {
    href: '/',
    label: 'Kanban',
    Component: Board,
    icon: <path d="M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v13h-4z" />,
  },
  {
    href: '/workflows',
    label: 'Workflows',
    Component: WorkflowsPage,
    icon: (
      <>
        <rect x="3" y="3" width="6" height="6" rx="1" />
        <rect x="15" y="15" width="6" height="6" rx="1" />
        <path d="M6 9v9h9M9 6h9v9" />
      </>
    ),
  },
  {
    href: '/settings',
    label: 'Settings',
    Component: SettingsPage,
    icon: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="m10 3-.5 2-2 .9-1.8-.6-2 3.4 1.5 1.4v3.8l-1.5 1.4 2 3.4 1.8-.6 2 .9.5 2h4l.5-2 2-.9 1.8.6 2-3.4-1.5-1.4v-3.8l1.5-1.4-2-3.4-1.8.6-2-.9L14 3z" />
      </>
    ),
  },
]

export default function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname)
  const main = useRef<HTMLElement>(null)
  const previousPath = useRef(pathname)
  const page = pages.find(
    (item) => item.href === (pathname.replace(/\/+$/, '') || '/'),
  )
  const Page = page?.Component

  useEffect(() => {
    function handlePopState() {
      setPathname(window.location.pathname)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    document.title = `${page?.label ?? 'Page not found'} | Torchbearer`
    if (previousPath.current !== pathname) {
      main.current?.focus()
      window.scrollTo(0, 0)
      previousPath.current = pathname
    }
  }, [pathname, page])

  function navigate(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return

    event.preventDefault()
    const destination = event.currentTarget
    if (destination.pathname === window.location.pathname) return
    window.history.pushState(null, '', destination.href)
    setPathname(destination.pathname)
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <a
          href="/"
          className="brand"
          aria-label="Torchbearer home"
          onClick={navigate}
        >
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M12.4 1.5c.5 3.2-3.6 4.2-3.6 6.8 0 1 .4 1.7 1 2.2-.1-2 1.2-2.9 2.5-4.1-.2 2.4 2.7 2.9 2.7 5.1 0 1.8-1.3 3-3 3-3.3 0-5.5-2-5.5-5.1 0-3.2 3.8-4.5 5.9-7.9Z" />
              <path d="M6.5 15h11l-2.7 4.1h-1.3v3.4h-3v-3.4H9.2L6.5 15Z" />
            </svg>
          </span>
          Torchbearer
        </a>
      </header>
      <div className="app-layout">
        <aside className="app-sidebar">
          <nav className="app-nav" aria-label="Main navigation">
            {pages.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="nav-link"
                aria-current={page === item ? 'page' : undefined}
                onClick={navigate}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  {item.icon}
                </svg>
                <span>{item.label}</span>
              </a>
            ))}
          </nav>
        </aside>
        <div className="app-content">
          <main
            ref={main}
            tabIndex={-1}
            aria-label={page?.label ?? 'Page not found'}
          >
            {Page ? (
              <Page />
            ) : (
              <section className="placeholder-page">
                <h1>Page not found</h1>
                <p>Choose a page from the navigation to continue.</p>
              </section>
            )}
          </main>
          <footer className="app-footer">
            <span>
              Thy word is a lamp unto my feet, and a light unto my path. — Psalm
              119:105
            </span>
          </footer>
        </div>
      </div>
    </div>
  )
}
