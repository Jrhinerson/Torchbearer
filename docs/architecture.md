# Application foundation

Torchbearer runs on one developer's computer. React presents the task backlog, Django owns validation and stored state, and SQLite persists data on the local filesystem.

## Boundaries

- `frontend/src/app/`: application shell, theme-color synchronization, and layered shared styling. See the [styling system](styling.md) for font, token, and control conventions.
- `frontend/src/features/tasks/`: five-column board, task-creation popup, and task-specific API operations.
- `frontend/src/lib/api.ts`: same-origin requests and useful HTTP/connection errors.
- `backend/config/`: local settings, routing, health, and CSRF bootstrap.
- `backend/tasks/`: task models, serializers, views, migrations, and API tests.
- `scripts/`: setup, process management, verification, and isolated test services.

During development, Vite serves `http://127.0.0.1:5173` and forwards `/api/` to Django at `127.0.0.1:8000`. Both bind to loopback. Frontend code uses relative API URLs so a later desktop wrapper can reuse the interface and local service boundary.

The board presents Backlog, Plan, Integrate, Test, and Final Approval in that order. The New Task button lives inside Backlog and opens a native modal dialog with focus management, Cancel/Escape dismissal, draft retention, and validation feedback. A successful save closes the dialog and adds the task to Backlog. The board scrolls horizontally on narrow screens; the popup stays within the viewport. The later-stage columns establish the layout while transitions and approval rules remain future work.

## API contract

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/v1/health/` | Service health, independent of task data. |
| GET | `/api/v1/csrf/` | CSRF token and corresponding cookie for the local browser. |
| GET | `/api/v1/tasks/` | All tasks, newest first. |
| POST | `/api/v1/tasks/` | Validate and create a backlog task. |
| DELETE | `/api/v1/tasks/<uuid>/` | Permanently delete the selected task; return 204, or 404 if it is missing. |

A task contains a UUID, title, description, status, and creation/update timestamps. Titles are required and limited to 200 characters; descriptions are optional and limited to 10,000 characters. Clients cannot assign status. New tasks begin in `backlog`; this does not authorize an agent to execute them.

Django REST Framework serializers validate request data. Write requests explicitly use Django CSRF protection even for anonymous requests, and the React client retrieves a token before creating or deleting a task. The interface displays validation or connection errors and preserves an unsuccessful draft.

Each task has a Delete action with a confirmation prompt. Its card remains visible while the request is pending and is removed only after the backend confirms deletion. A failed deletion leaves the card visible with an error and an enabled retry action. Deletion removes the stored row; no schema migration is needed.

## Local persistence

The default database is `.local/torchbearer.sqlite3`. `TORCHBEARER_DATA_DIR` can move the database to another local directory; a relative override is resolved against the process working directory. Database files are ignored by Git.

Django migrations are the source of schema changes. Setup applies migrations without replacing existing data. Startup checks for unapplied migrations and does not reset or seed the database.

API tests use Django's isolated test database. Browser tests start Django with a new temporary data directory, and restart verification starts two successive backend processes against one temporary SQLite database. These checks do not use the developer's normal database.

Browser tests bind dedicated ports 15173 (Vite) and 18000 (Django). Their Vite proxy uses `TORCHBEARER_API_PROXY`, and the isolated backend launcher receives its port and trusted frontend origin through test-only environment variables. Development retains ports 5173 and 8000, allowing verification alongside a running app.

## Process lifecycle

`scripts/dev.py` manages Django and Vite together. It checks ports and pending migrations, starts child process groups, forwards shutdown through its signal handlers, and stops their process trees when either service exits or the launcher is interrupted. Child processes do not read the launcher's terminal input. Django's automatic reloader is disabled so its process remains under the launcher's control.

`scripts/check_launcher.py` verifies both services start and stop together. Its Windows check requires a console to send Ctrl+Break; it was verified locally on Windows. CI runs this signal check on Linux, while API, build, browser, migration, and restart-persistence checks are configured for both Linux and Windows.

## Accountability and future work

This foundation records proposed tasks. Human approval workflows, decision history, revision-bound approvals, and agent execution will be specified in subsequent plans. Before execution is introduced, the backend must distinguish human decisions from agent actions and enforce allowed transitions at the service boundary.

Keep future workflow rules in backend application services rather than in React event handlers or agent prompts. Agent adapters should translate approved work into external tool operations without becoming the source of task state or human authorization. A desktop wrapper can start the same local service and display the React interface; installation, updates, and bundled Python distribution are later work.

The first release is a local single-user development application. Multi-user authentication and remote access are future capabilities, and the current development configuration should remain local.
