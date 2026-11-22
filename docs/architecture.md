# Application foundation

Torchbearer runs on one developer's computer. React presents the task backlog, Django owns validation and stored state, and SQLite persists data on the local filesystem.

## Boundaries

- `frontend/src/app/`: application shell and shared styling.
- `frontend/src/features/tasks/`: five-column board, task-creation popup, and task-specific API operations.
- `frontend/src/lib/api.ts`: same-origin requests and useful HTTP/connection errors.
- `backend/config/`: local settings, routing, health, and CSRF bootstrap.
- `backend/tasks/`: task models, serializers, views, migrations, and API tests.
- `scripts/`: setup, process management, verification, and isolated test services.

During development, Vite serves `http://127.0.0.1:5173` and forwards `/api/` to Django at `127.0.0.1:8000`. Both bind to loopback. Frontend code uses relative API URLs so a later desktop wrapper can reuse the interface and local service boundary.

The board presents Backlog, Plan, Integrate, Test, and Final Approval in that order. The New Task button opens a native modal with draft retention and repository selection. Plan, Integrate, and Test have persisted agent selectors; Backlog and Final Approval are human-only. Cards show execution state and open a review dialog containing results, logs, code changes, human decisions, and approval/rework controls. The board and review poll every two seconds without overlapping requests; failed polls preserve the last known state and retry. Accessible labels stay inside positioned column containers to prevent narrow-screen overflow.

## API contract

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/v1/health/` | Service health, independent of task data. |
| GET | `/api/v1/csrf/` | CSRF token and corresponding cookie for the local browser. |
| GET | `/api/v1/tasks/` | All tasks, newest first. |
| POST | `/api/v1/tasks/` | Validate and create a backlog task. |
| DELETE | `/api/v1/tasks/<uuid>/` | Delete a backlog task; return 204, 404 if missing, or 409 if already started. |
| GET/PATCH | `/api/v1/tasks/<uuid>/` | Read a task; PATCH only its repository while in Backlog. |
| GET | `/api/v1/routing/` | Supported agents, persisted assignments, and worker availability. |
| PATCH | `/api/v1/routing/<stage>/` | Assign an agent or Unassigned to a working column. |
| GET/POST | `/api/v1/repositories/` | List or register validated local Git repository roots. |
| POST | `/api/v1/tasks/<uuid>/actions/` | Apply a revision-checked human transition and queue its run when applicable. |
| GET | `/api/v1/tasks/<uuid>/runs/` | Attempt results, bounded live logs, and human decision history. |
| POST | `/api/v1/tasks/<uuid>/runs/<run_uuid>/cancel/` | Cancel queued work or request active-run cancellation. |
| GET | `/api/v1/tasks/<uuid>/workspace/` | Current code-change preview and fingerprint. |

A task contains a UUID, title, description, repository, stage, revision, workspace metadata, completion timestamp, and creation/update timestamps. Titles are limited to 200 characters and descriptions to 10,000. New tasks always begin in `backlog`; creating a task or assigning a column agent never starts execution. Clients cannot directly set stage, revision, workspace metadata, or completion. Existing tasks can remain without a repository until planning starts.

Django REST Framework serializers validate request data. Write requests explicitly use Django CSRF protection even for anonymous requests, and the React client retrieves a token before creating or deleting a task. The interface displays validation or connection errors and preserves an unsuccessful draft.

Backlog tasks retain Delete with confirmation and failure recovery. Started tasks retain their workspace and history and cannot be deleted through the API. Repository changes are atomically limited to Backlog so they cannot race a start action.

## Workflow and workspaces

`backend/tasks/workflow.py` owns transitions. Every action requires the expected task revision; an atomic compare-and-swap rejects duplicate or stale requests. A database constraint limits each task to one queued or running attempt. The selected agent is snapshotted when queuing; changing a dropdown leaves existing attempts alone.

Start Planning queues Plan. Successful runs stay in their column awaiting human review. Approval moves Plan to Integrate, Integrate to Test, or Test to Final Approval; the first two transitions atomically record approval and queue the next run. Final approval records completion without a new column or automatic merge. Retry, revision, cancellation, and send-back decisions are recorded independently of agent output. Failed Test runs wait for human-directed rework or retry.

Approval names the latest run and its fingerprint. That fingerprint covers HEAD, index changes, and contents and modes of tracked and non-ignored untracked files. Approval recomputes it; a queued handoff checks the same baseline before launch. Plan and Test also compare before/after fingerprints and block review if files changed. Ignored caches are permitted. Submodules and nested repositories are rejected until their contents can be covered by the review contract.

`workspaces.py` creates a retained `torchbearer/<task_uuid>` branch and linked worktree under the data directory. The repository is immutable after starting. Path, branch, and Git common-directory checks prevent silent workspace substitution. Creation records its intended path, branch, and base commit before Git operations so incomplete initial creation can be retried without overwriting work. Uncommitted source-checkout changes and ignored dependencies are not copied; no automatic removal or merging occurs.

`cli.py` resolves installed executables, including known Windows npm entry points without invoking a command shell. `adapters.py` checks versions and starts fresh non-interactive sessions through Codex JSONL, Claude Code stream JSON, or Pi JSON mode. Prompts travel over stdin and include the task, full approved plan, recent results, and human feedback. CLI model/authentication defaults are reused. Context, CLI version, selected agent, and result persist with each run; handoffs do not depend on vendor session IDs.

Results require `outcome`, `summary`, `details`, and `tests`. Test cannot report completion without reported passing validation commands. Protocol failures, nonzero exit codes, malformed results, permission denials, timeouts, and output limits never count as success. Log tails retain 128,000 characters, JSONL records are limited to 2 MiB, and lifetime output to 20 MiB. Code previews are capped at 64,000 characters and indicate truncation.

## Local persistence

The default database is `.local/torchbearer.sqlite3`. `TORCHBEARER_DATA_DIR` moves the database, workspaces, and run artifacts together; relative paths resolve against the working directory. SQLite uses immediate transactions with a busy timeout to avoid deferred read-to-write lock upgrades between API actions and the worker. Transactions protect transitions and claims; no database transaction stays open during agent execution. Database files and generated workspaces are ignored by Git.

Django migrations are the source of schema changes. Setup applies migrations without replacing existing data. Startup checks for unapplied migrations and does not reset or seed the database.

API tests use Django's isolated test database. Browser tests start Django with a new temporary data directory, and restart verification starts two successive backend processes against one temporary SQLite database. These checks do not use the developer's normal database.

## Process lifecycle

`scripts/dev.py` manages Django, one agent worker, and Vite together. It checks ports and pending migrations, starts child process groups, forwards shutdown, and stops their trees if any service exits. Ports can be selected explicitly. Django's reloader stays disabled; source changes require restarting the launcher.

The worker holds an OS file lock for the configured data directory, preventing a second worker from recovering live jobs. It processes persisted queued attempts sequentially and updates a heartbeat for the UI. On restart, previously running attempts become Interrupted and require explicit retry; queued work remains eligible to run. Cancellation is checked during execution and again atomically before saving success. Windows agents start suspended, are assigned to a kill-on-close Job Object, then resume; worker death closes the job and stops descendants. POSIX agents use a process group with a parent-monitoring host, and cancellation kills that group. A real-process test kills only the worker and verifies descendant cleanup and queue recovery.

`scripts/check_launcher.py` verifies that the backend, frontend, and worker start and stop together using temporary data and available ports. Its Windows check requires a console to send Ctrl+Break; it was verified locally on Windows. CI runs this signal check on Linux, while API, build, browser, migration, and restart-persistence checks are configured for both Linux and Windows.

## Accountability and future work

Task stages and approvals are enforced by backend application services. Adapters report results and never directly advance task state. The local browser invokes explicit revision-checked decision endpoints; prompts instruct agents to avoid Torchbearer APIs and database files. This is a local single-user workflow boundary, not an authentication or hostile-process isolation boundary.

Keep future workflow rules in backend application services rather than in React event handlers or agent prompts. Agent adapters should translate approved work into external tool operations without becoming the source of task state or human authorization. A desktop wrapper can start the same local service and display the React interface; installation, updates, and bundled Python distribution are later work.

The first release is a local single-user development application. Multi-user authentication and remote access are future capabilities, and the current development configuration should remain local.
