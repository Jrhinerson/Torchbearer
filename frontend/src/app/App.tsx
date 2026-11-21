import Board from '../features/tasks/Board'

export default function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <a href="/" className="brand" aria-label="Torchbearer home">
          <span className="brand-mark" aria-hidden="true">
            t
          </span>
          Torchbearer<span className="local-label">LOCAL</span>
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
