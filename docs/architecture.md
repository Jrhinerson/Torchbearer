# Application foundation

Torchbearer runs on one developer's computer. React presents the task backlog, Django owns validation and stored state, and SQLite persists data on the local filesystem.

## Boundaries

- `frontend/src/app/`: application shell and shared styling.
- `frontend/src/features/tasks/`: five-column board, task-creation popup, and task-specific API operations.
- `frontend/src/features/projects/`: searchable project selection, local-folder browser, cloning and project management inside task creation.
- `frontend/src/lib/api.ts`: same-origin requests and useful HTTP/connection errors.
- `backend/config/`: local settings, routing, health, and CSRF bootstrap.
- `backend/tasks/`: task models, serializers, views, migrations, and API tests.
- `backend/projects/`: stored projects, local directory and Git operations, serializers, views, migrations and API tests.
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
| GET | `/api/v1/projects/` | Saved active projects, ordered by name and ID. |
| POST | `/api/v1/projects/` | Register a local folder or clone an HTTPS/SSH Git URL to a new folder. |
| GET / PATCH | `/api/v1/projects/<uuid>/` | Read a project or update its display name. |
| DELETE | `/api/v1/projects/<uuid>/` | Archive the project; keep files and associated tasks. |
| POST | `/api/v1/projects/folders/` | Browse immediate visible subfolders and the parent of a local path; defaults to the server user's home. |

A task contains a UUID, title, description, optional nested project, status, and creation/update timestamps. Creation accepts an optional `project_id` UUID or null; missing values keep existing clients compatible. Titles are required and limited to 200 characters; descriptions are optional and limited to 10,000 characters. Clients cannot assign status. New tasks begin in `backlog`; this does not authorize an agent to execute them.

A project has a UUID, a display name of up to 200 characters, a unique canonical absolute folder path, an archive flag and timestamps. Local registration accepts `path`, an optional `name`, and `source: "local"` (the default). Cloning accepts `source: "clone"`, `url`, a new destination `path` with an existing parent, and optional `name`. Folders may be ordinary workspaces or Git repositories. Filesystem operations run on the backend machine. Renaming only changes the display name, and PATCH cannot change the folder. DELETE archives the row; associated task responses keep the project details and archive flag. Re-registering an archived folder restores the same project ID. New tasks cannot select archived projects.

Cloning runs Git without a shell, with noninteractive credentials, disabled Git hooks and file/ext protocols, and a 120-second timeout. HTTPS and SSH clone URLs are accepted; local paths and embedded HTTPS credentials are rejected. Git clones into a temporary sibling folder, then moves files into a newly reserved destination after success. Existing files are never replaced. Clone failures clean the temporary checkout and return an error without Git's raw output. This is a bounded synchronous operation, so the task dialog prevents dismissal or submission while it runs. Network authentication remains the responsibility of the machine's Git setup.

Django REST Framework serializers validate request data. Write requests explicitly use Django CSRF protection even for anonymous requests, and the React client retrieves a token before modifying tasks or projects. Directory browsing also uses a CSRF-protected POST to keep local filesystem listings behind the same verification. The interface displays validation or connection errors and preserves an unsuccessful draft.

Each task has a Delete action with a confirmation prompt. Its card remains visible while the request is pending and is removed only after the backend confirms deletion. A failed deletion leaves the card visible with an error and an enabled retry action. Deletion removes the stored row; no schema migration is needed.

## Local persistence

The default database is `.local/torchbearer.sqlite3`. `TORCHBEARER_DATA_DIR` can move the database to another local directory; a relative override is resolved against the process working directory. Database files are ignored by Git.

Django migrations are the source of schema changes. Setup applies migrations without replacing existing data. Startup checks for unapplied migrations and does not reset or seed the database.

API tests use Django's isolated test database. Browser tests start Django with a new temporary data directory on separate ports (8001/5174 by default, overridable through `TORCHBEARER_TEST_BACKEND_PORT` and `TORCHBEARER_TEST_FRONTEND_PORT`), and restart verification starts two successive backend processes against one temporary SQLite database to check task, project and association persistence. These checks do not use the developer's normal database. Browser clone-success responses and API Git subprocess results are simulated; live remote authentication is not exercised.

## Process lifecycle

`scripts/dev.py` manages Django and Vite together. It checks ports and pending migrations, starts child process groups, forwards shutdown through its signal handlers, and stops their process trees when either service exits or the launcher is interrupted. Child processes do not read the launcher's terminal input. Django's automatic reloader is disabled so its process remains under the launcher's control.

`scripts/check_launcher.py` verifies both services start and stop together. Its Windows check requires a console to send Ctrl+Break; it was verified locally on Windows. CI runs this signal check on Linux, while API, build, browser, migration, and restart-persistence checks are configured for both Linux and Windows.

## Accountability and future work

This foundation records proposed tasks. Human approval workflows, decision history, revision-bound approvals, and agent execution will be specified in subsequent plans. Before execution is introduced, the backend must distinguish human decisions from agent actions and enforce allowed transitions at the service boundary.

Keep future workflow rules in backend application services rather than in React event handlers or agent prompts. Agent adapters should translate approved work into external tool operations without becoming the source of task state or human authorization. A desktop wrapper can start the same local service and display the React interface; installation, updates, and bundled Python distribution are later work.

The first release is a local single-user development application. Multi-user authentication and remote access are future capabilities, and the current development configuration should remain local.
