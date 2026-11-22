# Torchbearer

Torchbearer is a local kanban application that helps individual developers retain ownership of engineering decisions while coordinating coding agents.

The application uses React and TypeScript for its interface, Python and Django for its backend, and SQLite for persistent local storage.

The first implementation is described in [the foundation plan](docs/plans/001-app-foundation.md). Project planning conventions are recorded in [AGENTS.md](AGENTS.md).

## Start locally

Prerequisites: Python 3.14, Node.js 24 or newer, and npm. Local verification used Node.js 26. On macOS/Linux, use `python3.14` in place of `python` if necessary.

From the repository root:

```text
python scripts/setup.py
python scripts/dev.py
```

Open **http://127.0.0.1:5173**. The board has Backlog, Plan, Integrate, Test, and Final Approval columns. Click **New Task** inside Backlog to open the creation popup; saved tasks appear in Backlog and remain after a refresh or restart. Cancel, Escape, or the close button dismisses the popup and retains the draft. Use a card's Delete button and confirm to permanently remove it. Ctrl+C stops both services; Ctrl+Break is also supported on Windows. Start only Django with `python scripts/dev.py --backend-only`.

Setup creates `.venv/`, installs the pinned Python requirements and frontend lockfile, and applies migrations without replacing existing data. Startup checks ports and unapplied migrations. After a schema change, rerun setup or apply migrations explicitly.

Vite refreshes frontend edits automatically. Restart the launcher after editing Python code; Django's automatic reloader is disabled so the launcher can reliably manage its process tree. These commands start local development services.

## Configuration and data

| Setting | Default | Purpose |
| --- | --- | --- |
| `TORCHBEARER_DATA_DIR` | `.local/` | Local directory containing `torchbearer.sqlite3`. |
| `DJANGO_DEBUG` | `1` | Django development diagnostics; use `0` to disable. |
| `DJANGO_SECRET_KEY` | Local development value | Override Django's development signing key. |

The backend listens at `127.0.0.1:8000`. Vite forwards `/api/` requests to it; its own port is fixed at `5173`. The service health endpoint is `/api/v1/health/`.

SQLite files, environment files containing secrets, dependency directories, builds, and test artifacts are ignored by Git. Data persists on disk rather than in browser state. To back up the default database, stop the application and copy `.local/torchbearer.sqlite3`.

## Verify changes

Run the portable checks after setup:

```text
python scripts/check.py
python scripts/check_persistence.py
```

The first command runs Python lint/format checks, Django system and migration checks, API tests, frontend format/lint checks, TypeScript checks, and a production build. The second creates a temporary database and verifies that a task survives a real backend process restart.

To run Chromium integration checks on Windows:

```powershell
Set-Location frontend
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

On macOS/Linux, run `npx playwright install chromium` and `npm run test:e2e` from `frontend/`. Linux may require `npx playwright install --with-deps chromium` to install browser system dependencies.

Browser checks start their own services on ports 15173 and 18000 and use a fresh temporary database, so the regular development launcher can remain running. Browser tests live in `frontend/tests/e2e/`, with screenshots and failure traces under the ignored root `test-results/` directory.

Run `python scripts/check_launcher.py` from the repository root in a terminal to verify both services start and stop together. Its Windows check requires a console to send Ctrl+Break. The restart and launcher checks also use temporary databases, leaving normal local data alone.

Individual API tests: `.venv\Scripts\python.exe -m pytest -q` on Windows, or `.venv/bin/python -m pytest -q` on macOS/Linux. Individual frontend commands include `npm run dev`, `npm run lint`, `npm run typecheck`, `npm run format:check`, and `npm run build` from `frontend/`; use `npm.cmd` in PowerShell if required by its script execution policy.

## Structure and review

- [Architecture](docs/architecture.md): application boundaries, API contract, persistence, and process lifecycle.
- [Styling system](docs/styling.md): locally bundled Inter, semantic dark/light palettes, reusable controls, and styling verification.
- [Commit plan](docs/plans/001-app-foundation.md): frontend, backend, and database impacts for each planned commit.
- [PR description draft](docs/pr-001-foundation.md): behavior, scope, and local validation results.

The foundation supports creating, listing, and deleting backlog tasks. Decision checkpoints, approvals, agent execution, and desktop packaging will be added in subsequent changes.

GitHub Actions is configured for Windows and Linux. All work is committed locally; the user handles pushing and opening a PR after their approval. Hosted CI has not run as part of local implementation.
