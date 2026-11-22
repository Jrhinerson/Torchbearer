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

Open **http://127.0.0.1:5173**. The board has Backlog, Plan, Integrate, Test, Code Review, and Final Approval columns. Click **New Task** inside Backlog to open the creation popup; saved tasks appear in Backlog and remain after a refresh or restart. Cancel, Escape, or the close button dismisses the popup and retains the draft. Use a backlog card's trash icon and confirm to permanently remove it. Ctrl+C stops all services; Ctrl+Break is also supported on Windows. Start Django and the worker without Vite with `python scripts/dev.py --backend-only`.

Setup creates `.venv/`, installs the pinned Python requirements and frontend lockfile, and applies migrations without replacing existing data. Startup checks ports and unapplied migrations, then starts Django, the agent worker, and Vite together. After a schema change, rerun setup or apply migrations explicitly. Use `--backend-port` and `--frontend-port` with the launcher when the default ports are occupied; separate app instances also need separate data directories.

Vite refreshes frontend edits automatically. Restart the launcher after editing Python code; Django's automatic reloader is disabled so the launcher can reliably manage its process tree. These commands start local development services.

## Projects in New Task

Choose **Project** to search saved projects by name or folder, then select one for the task. A Git project with an initial commit also supplies the repository used for agent execution. **No project** keeps a task unassigned. The selection stays with the draft when you dismiss the popup and stays selected for subsequent tasks until you change it. Existing registered repositories and their task selections are retained as saved projects when upgrading.

Use **Add Project** to open the local folder explorer. Navigate with Home, available common-folder and drive shortcuts, breadcrumbs, or **Parent folder**. Open a folder, then choose **Use this folder** and **Add and select project**. Git repositories and linked worktrees appear first with a **Git repository** marker; ordinary folders are also supported. **Filter folders** searches the current location, and **Enter a path** is an optional shortcut. **Change folder** reopens the selected location, while Cancel or Escape returns to the task draft.

Alternatively, choose **Clone a Git URL**, enter an HTTPS or SSH clone URL and the full path to a new destination folder, then **Clone and select project**. **Browse parent** opens the same explorer to choose an existing parent and suggests a destination using the repository name. The machine running Django supplies the folders, Git installation and Git credentials. Cloning is noninteractive and times out after two minutes; an existing destination is never overwritten. GitHub sign-in and repository search are not included.

Project names default to the folder name. Adding a project selects it while keeping the task title and description. **Manage projects** provides rename and removal controls. Renaming updates existing task labels; removal hides the project from the picker while keeping its files and task history. Adding the same folder again restores the saved project. A project association does not execute any work.

## Configuration and data

| Setting | Default | Purpose |
| --- | --- | --- |
| `TORCHBEARER_DATA_DIR` | `.local/` | Local directory containing `torchbearer.sqlite3`. |
| `DJANGO_DEBUG` | `1` | Django development diagnostics; use `0` to disable. |
| `DJANGO_SECRET_KEY` | Local development value | Override Django's development signing key. |
| `TORCHBEARER_RUN_TIMEOUT` | `1800` | Maximum CLI execution time in seconds for a single run. |

The backend listens at `127.0.0.1:8000`. Vite forwards `/api/` requests to it; its own port is fixed at `5173`. The service health endpoint is `/api/v1/health/`.

SQLite files, environment files containing secrets, dependency directories, builds, and test artifacts are ignored by Git. Data persists on disk rather than in browser state. To back up backlog records and routing configuration, stop the application and copy `.local/torchbearer.sqlite3`. Started tasks also need their worktrees and the original repositories' Git metadata; back up those together with the database to preserve executable workspaces.

## Agent routing

Choose an approach for each task in **New Task**. **Frontier** is the default, with **Codex** selected; **Claude Code** is the other frontier agent. **Hybrid** uses the selected frontier agent for detailed planning and Code Review, while **Pi** implements and tests. **Local Only** routes all four stages to Pi using its existing model configuration; local inference setup is separate.

Click a Backlog task's title to open its settings and change routing with **Save routing**, or select/add an execution repository. Cards start collapsed to their title and project on page load or reload; use each card's chevron to expand its description, routing, workflow actions, and footer. New cards also start collapsed. Unassigned tasks show **No project**. Manual expansion stays in place during automatic board updates; reloading the page collapses all cards again. The title opens settings or review in either state. Routing is locked when planning starts. Each queued attempt records its own agent. Missing installations or execution failures never substitute another agent. Backlog and Final Approval remain human-controlled.

Install and authenticate each CLI you want to use, and configure its default model in that CLI. Torchbearer uses the CLI's existing authentication and model configuration. The dropdown identifies missing installations; outdated versions, missing authentication, and permission denials appear as run errors. Current adapter version requirements are Codex CLI 0.162.0+, Claude Code 2.1.259+, and Pi 0.74.0+.

1. Create a task, choose its approach and frontier agent when applicable, and select a saved Git project. Use **Add Project** to register a local folder or clone a Git URL; click an existing Backlog task's title to select its execution repository in settings.
2. Click **Start planning**. Torchbearer creates a branch and worktree from the repository's committed HEAD; uncommitted changes and ignored dependencies in the original checkout are not copied.
3. Open the task to plan through a conversation with the selected agent. Answer its questions, add context, and refine the plan with **Send message** (Enter to send; Shift+Enter adds a line). Messages and replies survive refreshes. Sending a message keeps the task in Plan; **Approve plan & start Integrate** explicitly approves the latest complete plan and starts implementation. The Plan dialog omits the workspace path and Run history selector; later stages retain their report and history controls.
4. Test runs validation and reports actual command outcomes. Approve passing results to start Code Review, which inspects the complete task changes against the approved plan and test evidence. Every successful stage waits for human approval before advancing.
5. Approve Code Review to continue to Final Approval, then choose **Give final approval**. The task remains in the final column with an Approved badge and its history. Merging and worktree cleanup remain manual.

In Plan, each message queues a read-only reply with the full earlier planning conversation. **Stop reply** stops queued or running work; **Retry reply** retries a failed, stopped, or interrupted reply. You can prepare your next message while the agent is thinking. A failed send keeps your draft for retry. The latest complete plan contains the agreed decisions and is passed in full to implementation; a conversation exceeding the supported context limit blocks clearly instead of silently dropping earlier decisions.

The planning window follows T3 Code's chat layout: a full-height scrolling conversation, compact user messages, Markdown replies, and a rounded composer anchored at the bottom. The composer expands with your draft and shows the selected planning agent, with icon controls for sending and stopping replies. **Jump to latest** returns to the newest reply after scrolling back through the discussion. Plan approval remains a separate action above the composer.

In later stages, **Request revision** reruns the current stage with your instructions. Integrate can return to Plan; Test, Code Review, and Final Approval can return to Integrate. Rework must pass Test and Code Review again. **Cancel run** stops the running process tree or removes a queued attempt from execution. Started tasks retain their history and workspace; only backlog tasks can be deleted.

When upgrading from column routing, stop the launcher before applying migrations and restart afterward. Open an unfinished existing task through its title or **Review step** to choose routing once after queued or running work finishes or is cancelled. Existing attempt agents and history are retained. Unfinished tasks formerly awaiting Final Approval return to Test so their result can be approved to start Code Review. Completed tasks remain unchanged.

The worker processes one run at a time. Queued runs survive shutdown, while runs interrupted by a worker crash require explicit retry after reviewing the workspace. An offline notice appears when no worker is available; start with `python scripts/dev.py`, or run `.venv/Scripts/python.exe backend/manage.py runagentworker` separately on Windows (`.venv/bin/python` on macOS/Linux). Running Django alone does not start the worker.

Approvals are bound to both the latest result and the code snapshot. Edits after review invalidate approval, and edits after queuing block the next run. Plan, Test, and Code Review results are blocked if tracked or untracked non-ignored workspace files change; ignored test caches can be generated. CLI tool permissions still apply, and CLIs run as the current OS user. Worktrees containing submodules or nested repositories are not supported yet. Required dependencies must be prepared in the task worktree before validation can succeed.

Logs retain the last 128,000 characters per run. JSONL records are limited to 2 MiB and total CLI output to 20 MiB; exceeding these limits fails the run. The review dialog previews up to 64,000 characters of code changes and identifies truncated diffs so the full workspace can be reviewed separately.

Adapters use [Codex non-interactive JSON output](https://learn.chatgpt.com/docs/non-interactive-mode), [Claude Code's structured headless interface](https://code.claude.com/docs/en/headless), and [Pi's JSON mode](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/cli.md). Windows npm wrappers are resolved to their underlying Node entry points, keeping prompts off command shells. For nonstandard installations, `TORCHBEARER_CODEX_COMMAND`, `TORCHBEARER_CLAUDE_COMMAND`, and `TORCHBEARER_PI_COMMAND` accept JSON arrays containing an executable and fixed arguments; shell-script overrides are rejected. Set these only in the launcher's environment, never through the task UI.

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

Browser checks use separate ports (frontend `15173`, backend `18000`), their own services, a fresh temporary database and repository, and deterministic fake agent CLIs. The regular development launcher can remain running. They never invoke authenticated models or use the developer's normal data. Override test ports with `TORCHBEARER_TEST_FRONTEND_PORT` and `TORCHBEARER_TEST_BACKEND_PORT`. Browser tests live in `frontend/tests/e2e/`, with screenshots and failure traces under the ignored root `test-results/` directory. Clone success and pending states use a simulated response; remote credentials and network access are not required by the suite.

Run `python scripts/check_launcher.py` from the repository root in a terminal to verify the backend, frontend, and worker start and stop together. Its Windows check requires a console to send Ctrl+Break. The restart and launcher checks also use temporary databases and available ports, leaving normal local data alone. Backend tests include killing a real worker process to verify child cleanup, queue persistence, and explicit retry of interrupted work.

Individual API tests: `.venv\Scripts\python.exe -m pytest -q` on Windows, or `.venv/bin/python -m pytest -q` on macOS/Linux. Individual frontend commands include `npm run dev`, `npm run lint`, `npm run typecheck`, `npm run format:check`, and `npm run build` from `frontend/`; use `npm.cmd` in PowerShell if required by its script execution policy.

## Structure and review

- [Architecture](docs/architecture.md): application boundaries, API contract, persistence, and process lifecycle.
- [Styling system](docs/styling.md): locally bundled Inter, semantic dark/light palettes, reusable controls, and styling verification.
- [Commit plan](docs/plans/001-app-foundation.md): frontend, backend, and database impacts for each planned commit.
- [Task routing plan](docs/plans/005-task-agent-routing.md): per-task approaches, detailed handoffs, Code Review, migration, and cleanup.
- [PR description draft](docs/pr-001-foundation.md): behavior, scope, and local validation results.

The application supports reusable saved projects, backlog tasks, per-task agent routing, isolated task worktrees, reviewed stage transitions, execution history, and final human approval. Desktop packaging, automatic merging, custom stage prompts, model selectors, and parallel execution remain future work.

GitHub Actions is configured for Windows and Linux. All work is committed locally; the user handles pushing and opening a PR after their approval. Hosted CI has not run as part of local implementation.
