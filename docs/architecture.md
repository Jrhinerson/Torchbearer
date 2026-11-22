# Application foundation

Torchbearer runs on one developer's computer. React presents the task backlog, Django owns validation and stored state, and SQLite persists data on the local filesystem.

## Boundaries

- `frontend/src/app/`: application shell, theme-color synchronization, and layered shared styling. See the [styling system](styling.md) for font, token, and control conventions.
- `frontend/src/features/tasks/`: six-column board, task-creation popup, and task-specific API operations.
- `frontend/src/features/projects/`: searchable project selection, local-folder browser, cloning and project management inside task creation.
- `frontend/src/lib/api.ts`: same-origin requests and useful HTTP/connection errors.
- `backend/config/`: local settings, routing, health, and CSRF bootstrap.
- `backend/tasks/`: task models, serializers, views, migrations, and API tests.
- `backend/projects/`: stored projects, local directory and Git operations, serializers, views, migrations and API tests.
- `scripts/`: setup, process management, verification, and isolated test services.

During development, Vite serves `http://127.0.0.1:5173` and forwards `/api/` to Django at `127.0.0.1:8000`. Both bind to loopback. Frontend code uses relative API URLs so a later desktop wrapper can reuse the interface and local service boundary.

The board presents Backlog, Plan, Integrate, Test, Code Review, and Final Approval in that order. The New Task button opens a native modal with draft retention, saved-project selection, and task routing. Frontier defaults to Codex, with Claude Code also available; Hybrid uses the frontier agent for Plan and Code Review and Pi for Integrate and Test; Local Only uses Pi throughout. Routing is editable in Backlog and locked when planning starts; Backlog and Final Approval are human-only. Cards show execution state and open a review dialog containing results, logs, code changes, human decisions, and approval/rework controls. The board and review poll every two seconds without overlapping requests; failed polls preserve the last known state and retry. Accessible labels stay inside positioned column containers to prevent narrow-screen overflow.

Task cards contain read-only task context and workflow actions. Clicking a Backlog task's title opens its routing and repository settings in a native dialog; titles on started tasks open the review dialog. Legacy tasks that still need an initial routing choice configure it inside that review dialog. Routing fields and repository selection/registration controls are kept off the cards, and dismissing settings returns keyboard focus to the task title.

Each card has an independent expand/collapse button with `aria-expanded` and `aria-controls`. Cards start collapsed on page load or reload, including newly created cards. Collapsing keeps the title and project visible (or “No project” when unassigned) and hides the description, routing summary, workflow actions, footer, and errors. Hidden details remain mounted so pending operations and their state are retained. The board tracks expanded task IDs in page-session state independently of fetched task data, preserving manual expansion during polling and column transitions; a page reload starts with an empty set again.

## API contract

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/v1/health/` | Service health, independent of task data. |
| GET | `/api/v1/csrf/` | CSRF token and corresponding cookie for the local browser. |
| GET | `/api/v1/tasks/` | All tasks, newest first. |
| POST | `/api/v1/tasks/` | Validate and create a backlog task. |
| DELETE | `/api/v1/tasks/<uuid>/` | Delete a backlog task; return 204, 404 if missing, or 409 if already started. |
| GET/PATCH | `/api/v1/tasks/<uuid>/` | Read a task; revision-checked PATCH of repository and routing in Backlog, or an initial routing choice for an inactive legacy task. |
| GET | `/api/v1/routing/` | Agent classifications, supported task approaches, and worker availability. |
| GET/POST | `/api/v1/repositories/` | List or register validated local Git repository roots. |
| POST | `/api/v1/tasks/<uuid>/actions/` | Apply a revision-checked human transition and queue its run when applicable. |
| GET | `/api/v1/tasks/<uuid>/runs/` | Attempt results, bounded live logs, and human decision history. |
| POST | `/api/v1/tasks/<uuid>/runs/<run_uuid>/cancel/` | Cancel queued work or request active-run cancellation. |
| GET | `/api/v1/tasks/<uuid>/workspace/` | Current code-change preview and fingerprint. |
| GET | `/api/v1/projects/` | Saved active projects, ordered by name and ID. |
| POST | `/api/v1/projects/` | Register a local folder or clone an HTTPS/SSH Git URL to a new folder. |
| GET/PATCH | `/api/v1/projects/<uuid>/` | Read a project or update its display name. |
| DELETE | `/api/v1/projects/<uuid>/` | Archive the project; keep files and associated tasks. |
| POST | `/api/v1/projects/folders/` | Browse visible child folders with repository markers, parent, breadcrumbs, and location shortcuts; defaults to the server user's home. |

A task contains a UUID, title, description, optional nested project, execution repository, routing mode, optional frontier agent, resolved stage agents, next stage, current stage, revision, workspace metadata, completion timestamp, and creation/update timestamps. Titles are limited to 200 characters and descriptions to 10,000. New tasks always begin in `backlog`; creating a task or choosing routing never starts execution. Clients cannot directly set stage, revision, workspace metadata, or completion. Existing tasks can remain without a repository until planning starts.

Creation accepts an optional `project_id`; selecting a project whose folder is a validated Git repository root with a commit registers or reuses its execution repository. Ordinary folders remain valid projects, with execution requiring a repository before planning starts. Legacy repository requests remain supported; an explicit repository must match an explicitly selected project. Backlog repository changes also update or clear the saved-project association to keep the task context consistent.

A project has a UUID, a display name of up to 200 characters, a unique canonical absolute folder path, an archive flag and timestamps. Local registration accepts `path`, an optional `name`, and `source: "local"` (the default). Cloning accepts `source: "clone"`, `url`, a new destination `path` with an existing parent, and optional `name`. Folders may be ordinary workspaces or Git repositories. Filesystem operations run on the backend machine. Renaming only changes the display name, and PATCH cannot change the folder. DELETE archives the row; associated task responses keep the project details and archive flag. Re-registering an archived folder restores the same project ID. New tasks cannot select archived projects.

Adding a local project opens a focused native dialog over the task composer. Its explorer offers location shortcuts, clickable breadcrumbs, parent/child navigation, a current-folder filter, and optional path entry. Selecting a folder returns to the project form without changing the task draft; cancellation retains the previous folder and project selection. Browsing uses abortable requests and disables selection while loading or after an error, so a failed navigation cannot select a stale folder. Unreadable child entries are skipped; unreadable directory listings return a validation error with retry/navigation controls.

Folder listings include `path`, `parent`, `is_repository`, `breadcrumbs`, `locations`, and `folders`. Breadcrumbs and locations contain `name`/`path` pairs; each child also has `is_repository`. Locations include Home, existing Desktop/Documents/Downloads folders, and accessible Windows drives or the filesystem root. Repository markers detect a `.git` directory or file (including linked worktrees), without invoking Git for each row; execution still validates the repository separately. Repositories sort first, then ordinary folders, with names sorted case-insensitively. Listings cover only the current directory and do not recursively scan the disk.

Cloning runs Git without a shell, with noninteractive credentials, disabled Git hooks and file/ext protocols, and a 120-second timeout. HTTPS and SSH clone URLs are accepted; local paths and embedded HTTPS credentials are rejected. Git clones into a temporary sibling folder, then moves files into a newly reserved destination after success. Existing files are never replaced. Clone failures clean the temporary checkout and return an error without Git's raw output. This is a bounded synchronous operation, so the task dialog prevents dismissal or submission while it runs. Network authentication remains the responsibility of the machine's Git setup.

Django REST Framework serializers validate request data. Write requests explicitly use Django CSRF protection even for anonymous requests, and the React client retrieves a token before modifying tasks or projects. Directory browsing also uses a CSRF-protected POST to keep local filesystem listings behind the same verification. The interface displays validation or connection errors and preserves an unsuccessful draft.

Backlog tasks retain Delete with confirmation and failure recovery. Started tasks retain their workspace and history and cannot be deleted through the API. Repository and routing changes require the expected revision and are atomically limited to Backlog so they cannot race a start action. An unfinished legacy task without routing can make its initial choice outside Backlog only when no attempt is queued or running; subsequent changes are locked.

## Workflow and workspaces

`backend/tasks/workflow.py` owns transitions. Every action requires the expected task revision; an atomic compare-and-swap rejects duplicate or stale requests. A database constraint limits each task to one queued or running attempt. The task stores `routing_mode` and `frontier_agent`; `routing.py` owns agent classifications and derives stage agents without column assignments. The selected agent is snapshotted when queuing, so existing attempts retain their identities.

Start Planning queues Plan. Successful runs stay in their column awaiting human review. Approval moves Plan to Integrate, Integrate to Test, Test to Code Review, and Code Review to Final Approval; transitions into working stages atomically record approval and queue the next run. Final approval records completion without a new column or automatic merge. Retry, revision, cancellation, and send-back decisions are recorded independently of agent output. Failed Test or Code Review runs wait for human-directed rework or retry. Rework returns to Integrate and passes through testing and review again; only a successful current Code Review can receive final approval.

Plan presents a chronological chat instead of a run selector and report/revision form. The initial task is the first human message; each planning run's feedback and result store the next message and reply. The CSRF-protected `plan_message` action requires nonempty feedback of at most 4,000 characters, the current revision, the latest Plan run, and no active attempt. It queues another read-only Plan attempt without advancing the task. Blocked clarification replies are normal conversation turns. The interface preserves failed drafts, supports Enter/Shift+Enter, permits drafting during execution, and exposes stop/retry controls. Workspace metadata and the Run history selector are hidden only in Plan; later stages retain their review UI.

Approval names the latest run and its fingerprint. That fingerprint covers HEAD, index changes, and contents and modes of tracked and non-ignored untracked files. Approval recomputes it; a queued handoff checks the same baseline before launch. Plan, Test, and Code Review also compare before/after fingerprints and block review if files changed. Ignored caches are permitted. Submodules and nested repositories are rejected until their contents can be covered by the review contract.

`workspaces.py` creates a retained `torchbearer/<task_uuid>` branch and linked worktree under the data directory. The repository is immutable after starting. Path, branch, and Git common-directory checks prevent silent workspace substitution. Creation records its intended path, branch, and base commit before Git operations so incomplete initial creation can be retried without overwriting work. Uncommitted source-checkout changes and ignored dependencies are not copied; no automatic removal or merging occurs.

`cli.py` resolves installed executables, including known Windows npm entry points without invoking a command shell. `adapters.py` checks versions and starts fresh non-interactive sessions through Codex JSONL, Claude Code stream JSON, or Pi JSON mode. Prompts travel over stdin and include the task, full approved plan, explicit implementation and test artifacts, relevant rework findings, recent results, and human feedback. `prompts.py` selects required artifacts by approval and run sequence, recording their run IDs and contents independently of the six-attempt supplementary history. Planning specifies file-level steps, contracts, migrations, acceptance criteria, and validation sufficient for local implementation; missing or oversized required context blocks clearly. Code Review inspects the full changes in the worktree and requires passing Test evidence matching both the approved implementation and current workspace fingerprints. CLI model/authentication defaults are reused, including Pi configuration; local inference setup is separate. Context, CLI version, selected agent, and result persist with each run; handoffs do not depend on vendor session IDs.

Results require `outcome`, `summary`, `details`, and `tests`. Test cannot report completion without reported passing validation commands. Protocol failures, nonzero exit codes, malformed results, permission denials, timeouts, and output limits never count as success. Log tails retain 128,000 characters, JSONL records are limited to 2 MiB, and lifetime output to 20 MiB. Code previews are capped at 64,000 characters and indicate truncation.

Planning prompts replay all planning turns in sequence through `plan_conversation`, independently of the six-attempt supplementary history. Earlier planning replies are not truncated. A complete reply must include a self-contained current plan incorporating the conversation's decisions, so the latest explicitly approved result remains the implementation handoff. Clarification questions use a blocked outcome and cannot be approved. The existing 200,000-character context guard blocks oversized conversations without silently losing decisions. Existing run and decision records provide persistence; no new table or migration is needed.

## Local persistence

The default database is `.local/torchbearer.sqlite3`. `TORCHBEARER_DATA_DIR` moves the database, workspaces, and run artifacts together; relative paths resolve against the working directory. SQLite uses immediate transactions with a busy timeout to avoid deferred read-to-write lock upgrades between API actions and the worker. Transactions protect transitions and claims; no database transaction stays open during agent execution. Database files and generated workspaces are ignored by Git.

Django migrations are the source of schema changes. Merge migrations join the project, workflow, and task-routing histories; existing repositories become saved projects while task associations, project names, and archive state are preserved. Setup applies migrations without replacing existing data. Startup checks for unapplied migrations and does not reset or seed the database. The routing upgrade leaves existing task policies unset, preserves recorded attempts and completed tasks, and moves unfinished Final Approval tasks to Test with an incremented revision so they can enter Code Review. Stop the launcher before migrating, then restart it.

API tests use Django's isolated test database. Browser tests start Django with a new temporary data directory, and restart verification starts two successive backend processes against one temporary SQLite database to check task, project and association persistence. These checks do not use the developer's normal database. Browser clone-success responses and API Git subprocess results are simulated; live remote authentication is not exercised.

Browser tests default to ports 15173 (Vite) and 18000 (Django), with overrides through `TORCHBEARER_TEST_FRONTEND_PORT` and `TORCHBEARER_TEST_BACKEND_PORT`. Both services receive the selected `TORCHBEARER_FRONTEND_PORT` and `TORCHBEARER_BACKEND_PORT`, keeping the Vite proxy and trusted frontend origin aligned. Development retains ports 5173 and 8000, allowing verification alongside a running app.

## Process lifecycle

`scripts/dev.py` manages Django, one agent worker, and Vite together. It checks ports and pending migrations, starts child process groups, forwards shutdown, and stops their trees if any service exits. Ports can be selected explicitly. Django's reloader stays disabled; source changes require restarting the launcher.

The worker holds an OS file lock for the configured data directory, preventing a second worker from recovering live jobs. It processes persisted queued attempts sequentially and updates a heartbeat for the UI. On restart, previously running attempts become Interrupted and require explicit retry; queued work remains eligible to run. Cancellation is checked during execution and again atomically before saving success. Windows agents start suspended, are assigned to a kill-on-close Job Object, then resume; worker death closes the job and stops descendants. POSIX agents use a process group with a parent-monitoring host, and cancellation kills that group. A real-process test kills only the worker and verifies descendant cleanup and queue recovery.

`scripts/check_launcher.py` verifies that the backend, frontend, and worker start and stop together using temporary data and available ports. Its Windows check requires a console to send Ctrl+Break; it was verified locally on Windows. CI runs this signal check on Linux, while API, build, browser, migration, and restart-persistence checks are configured for both Linux and Windows.

## Accountability and future work

Task stages and approvals are enforced by backend application services. Adapters report results and never directly advance task state. The local browser invokes explicit revision-checked decision endpoints; prompts instruct agents to avoid Torchbearer APIs and database files. This is a local single-user workflow boundary, not an authentication or hostile-process isolation boundary.

Keep future workflow rules in backend application services rather than in React event handlers or agent prompts. Agent adapters should translate approved work into external tool operations without becoming the source of task state or human authorization. A desktop wrapper can start the same local service and display the React interface; installation, updates, and bundled Python distribution are later work.

The first release is a local single-user development application. Multi-user authentication and remote access are future capabilities, and the current development configuration should remain local.
