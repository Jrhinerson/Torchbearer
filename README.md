# Torchbearer

Torchbearer is a local kanban application that helps individual developers retain ownership of engineering decisions while coordinating coding agents.

The application uses React and TypeScript for its interface, Python and Django for its backend, and SQLite for persistent local storage.

The first implementation is described in [the foundation plan](docs/plans/001-app-foundation.md). Project planning conventions are recorded in [AGENTS.md](AGENTS.md).

## Development foundation

Use Python 3.14 and Node.js 24 or newer. Create a virtual environment with `python -m venv .venv`, install `backend/requirements.txt` into it, and run `npm ci --prefix frontend`.

Apply Django's migrations with `.venv\Scripts\python.exe backend/manage.py migrate` on Windows, or `.venv/bin/python backend/manage.py migrate` on macOS/Linux. The SQLite database defaults to `.local/torchbearer.sqlite3`; set `TORCHBEARER_DATA_DIR` to use a different local directory.

Run Django at `127.0.0.1:8000` and Vite with `npm run dev --prefix frontend`. Vite forwards `/api/` to Django. The health endpoint is `/api/v1/health/`.

For repeatable setup on Windows, macOS, and Linux, run `python scripts/setup.py` from the repository root. Then use `python scripts/dev.py` to start both services; Ctrl+C stops both. Start only Django with `python scripts/dev.py --backend-only`.

Setup applies migrations without replacing existing data. Startup checks for pending migrations rather than applying them implicitly; rerun setup or apply migrations explicitly when a schema change is introduced. Django runs without its automatic reloader so the launcher can manage its process reliably; restart the launcher after editing Python code. Vite refreshes frontend changes automatically.

## Verification

Run `.venv\Scripts\python.exe -m pytest -q` on Windows, or `.venv/bin/python -m pytest -q` on macOS/Linux, for API checks. Run `python scripts/check_persistence.py` for a real backend restart check using a temporary SQLite database.

Install the browser once with `npx playwright install chromium` from `frontend/`, then run `npm run test:e2e --prefix frontend`. Browser tests live in `frontend/tests/e2e/` so they resolve the frontend's pinned testing dependencies; they start their own services and a fresh temporary database. Stop the regular development launcher before running them.

Run `python scripts/check_launcher.py` in a terminal to verify that the shared launcher starts and stops both services. This uses Ctrl+Break for its Windows shutdown check and requires a console; the regular launcher also accepts Ctrl+C.
