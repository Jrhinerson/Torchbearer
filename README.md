# Torchbearer

Torchbearer is a local kanban application that helps individual developers retain ownership of engineering decisions while coordinating coding agents.

The application uses React and TypeScript for its interface, Python and Django for its backend, and SQLite for persistent local storage.

The first implementation is described in [the foundation plan](docs/plans/001-app-foundation.md). Project planning conventions are recorded in [AGENTS.md](AGENTS.md).

## Development foundation

Use Python 3.14 and Node.js 24 or newer. Create a virtual environment with `python -m venv .venv`, install `backend/requirements.txt` into it, and run `npm ci --prefix frontend`.

Apply Django's migrations with `.venv\Scripts\python.exe backend/manage.py migrate` on Windows, or `.venv/bin/python backend/manage.py migrate` on macOS/Linux. The SQLite database defaults to `.local/torchbearer.sqlite3`; set `TORCHBEARER_DATA_DIR` to use a different local directory.

Run Django at `127.0.0.1:8000` and Vite with `npm run dev --prefix frontend`. Vite forwards `/api/` to Django. The health endpoint is `/api/v1/health/`.
