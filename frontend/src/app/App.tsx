import Board from '../features/tasks/Board'

export default function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <a href="/" className="brand" aria-label="Torchbearer home">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M12.4 1.5c.5 3.2-3.6 4.2-3.6 6.8 0 1 .4 1.7 1 2.2-.1-2 1.2-2.9 2.5-4.1-.2 2.4 2.7 2.9 2.7 5.1 0 1.8-1.3 3-3 3-3.3 0-5.5-2-5.5-5.1 0-3.2 3.8-4.5 5.9-7.9Z" />
              <path d="M6.5 15h11l-2.7 4.1h-1.3v3.4h-3v-3.4H9.2L6.5 15Z" />
            </svg>
          </span>
          Torchbearer<span className="badge local-label">LOCAL</span>
        </a>
        <span className="device-label">
          <span className="device-dot" />
          On this device
        </span>
      </header>
      <main>
        <Board />
      </main>
      <footer className="app-footer">
        <span>Thoughtful work starts with a clear decision.</span>
        <span>YOUR WORK. YOUR CALL.</span>
      </footer>
    </div>
  )
}
