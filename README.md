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

Open **http://127.0.0.1:5173**. The board has Backlog, Plan, Integrate, Code Review, and Final Approval columns. Click **New Task** inside Backlog to open the creation popup; saved tasks appear in Backlog and remain after a refresh or restart. Cancel, Escape, or the close button dismisses the popup and retains the draft. Use an unstarted backlog card's trash icon and confirm to permanently remove it. Ctrl+C stops all services; Ctrl+Break is also supported on Windows. Start Django and the worker without Vite with `python scripts/dev.py --backend-only`.

Use the left sidebar to navigate between **Kanban** (`/`), **Workflows** (`/workflows`), and **Settings** (`/settings`). Settings contains account Connections; Workflows is reserved for future development. The current page is highlighted, and each URL supports refresh and browser Back/Forward navigation.

Setup creates `.venv/`, installs the pinned Python requirements and frontend lockfile, and applies migrations without replacing existing data. Startup checks ports and unapplied migrations, then starts Django, the agent worker, and Vite together. After a schema change, rerun setup or apply migrations explicitly. Use `--backend-port` and `--frontend-port` with the launcher when the default ports are occupied; separate app instances also need separate data directories.

Vite refreshes frontend edits automatically. Restart the launcher after editing Python code; Django's automatic reloader is disabled so the launcher can reliably manage its process tree. These commands start local development services.

## Projects in New Task

Choose **Project** to search saved projects by name or folder, then select one for the task. A Git project with an initial commit also supplies the repository used for agent execution. **No project** keeps a task unassigned. The selection stays with the draft when you dismiss the popup and stays selected for subsequent tasks until you change it. Existing registered repositories and their task selections are retained as saved projects when upgrading.

Use **Add Project** to open the local folder explorer. Navigate with Home, available common-folder and drive shortcuts, breadcrumbs, or **Parent folder**. Open a folder, then choose **Use this folder** and **Add and select project**. Git repositories and linked worktrees appear first with a **Git repository** marker; ordinary folders are also supported. **Filter folders** searches the current location, and **Enter a path** is an optional shortcut. **Change folder** reopens the selected location, while Cancel or Escape returns to the task draft.

Alternatively, choose **Clone a Git URL**, enter an HTTPS or SSH clone URL and the full path to a new destination folder, then **Clone and select project**. **Browse parent** opens the same explorer to choose an existing parent and suggests a destination using the repository name. The machine running Django supplies the folders, Git installation and Git credentials. Cloning is noninteractive and times out after two minutes; an existing destination is never overwritten. Repository search and using the Settings connection for cloning are future work.

Project names default to the folder name. Adding a project selects it while keeping the task title and description. **Manage projects** provides rename and removal controls. Renaming updates existing task labels; removal hides the project from the picker while keeping its files and task history. Adding the same folder again restores the saved project. A project association does not execute any work.

## GitHub connection

Open **Settings → Connections** and choose **Connect GitHub**. Torchbearer requests a one-time code and opens GitHub in a new browser tab. Copy the code from Settings, enter it in GitHub, and sign in to the account you want to connect before approving access. Settings automatically displays the verified username after authorization. If your browser blocks the new tab, use **Continue on GitHub**. Sign-in codes expire after 15 minutes; **Cancel sign-in** stops the attempt.

Install [GitHub CLI](https://cli.github.com/) (`gh`) on the machine running Django before connecting; no separate OAuth app registration or client secret is needed. This uses [GitHub CLI's browser authorization](https://cli.github.com/manual/gh_auth_login), including its standard `repo`, `read:org`, and `gist` scopes. The authorization screen identifies the application as **GitHub CLI**. Torchbearer verifies the resulting account using GitHub's authenticated user endpoint rather than adopting a pre-existing login or an environment token.

**Change account** starts a fresh browser authorization and replaces the connection only after successful verification. **Disconnect** removes Torchbearer's saved connection and CLI configuration. It does not revoke GitHub CLI's OAuth authorization or sign other applications out of system credential storage. To revoke that grant, use GitHub's authorized OAuth application settings, which can also affect other GitHub CLI sessions.

The account identity persists in SQLite, and isolated CLI configuration lives under `TORCHBEARER_DATA_DIR/github/`. GitHub CLI stores credentials in the system credential store when available, falling back to its local configuration file when secure storage is unavailable. Tokens are never stored in Torchbearer's SQLite tables or returned to the frontend. Include the data directory and credential store in backups if you need to preserve the connection. An unfinished login can survive navigating away or refreshing Settings while Django remains running; restart Django and start a new sign-in if it is interrupted.

The connection currently records and validates the selected GitHub account. Project cloning and agent CLIs retain their existing authentication behavior.

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

Choose an approach for each task in **New Task**. **Frontier** is the default, with **Codex** selected; **Claude Code** is the other frontier agent. **Hybrid** uses the selected frontier agent for detailed planning and Code Review, while **Pi** implements and tests. **Local Only** routes all three working stages to Pi using its existing model configuration; local inference setup is separate.

Click an unstarted Backlog task's title to open its settings and change routing with **Save routing**, or select/add an execution repository. Cards start collapsed to their title and project on page load or reload; use each card's chevron to expand its description, routing, workflow actions, and footer. New cards also start collapsed. Unassigned tasks show **No project**. Manual expansion stays in place during automatic board updates; reloading the page collapses all cards again. The title opens settings or review in either state. Routing is locked when refinement or planning starts. Each queued attempt records its own agent. Missing installations or execution failures never substitute another agent. Backlog and Final Approval remain human-controlled, with optional refinement and post-approval retrospectives.

Install and authenticate each CLI you want to use, and configure its default model in that CLI. Torchbearer uses the CLI's existing authentication and model configuration. The dropdown identifies missing installations; outdated versions, missing authentication, and permission denials appear as run errors. Current adapter version requirements are Codex CLI 0.162.0+, Claude Code 2.1.259+, and Pi 0.74.0+.

1. Create a task, choose its approach and frontier agent when applicable, and select a saved Git project. Use **Add Project** to register a local folder or clone a Git URL; click an unstarted Backlog task's title to select its execution repository in settings.
2. Click **Start planning**. Torchbearer creates a branch and worktree from the repository's committed HEAD on first refinement or planning; uncommitted changes and ignored dependencies in the original checkout are not copied.
3. Open the task to plan through a conversation with the selected agent. Answer its questions, add context, and refine the plan with **Send message** (Enter to send; Shift+Enter adds a line). Messages and replies survive refreshes. Sending a message keeps the task in Plan; **Approve plan & start Integrate** explicitly approves the latest complete plan and starts implementation. The conversation continues through Integrate, Code Review, and Final Approval, preserving earlier messages and reports as the task advances.
4. Integrate implements the plan, writes tests, and runs validation, reporting actual command outcomes. Approve passing results to start Code Review, which inspects the complete task changes against the approved plan and test evidence. Every successful stage waits for human approval before advancing.
5. Approve Code Review to continue to Final Approval, then choose **Give final approval**. The task remains in the final column with an Approved badge and its history. Merging and worktree cleanup remain manual.

In Plan, each message queues a read-only reply with the full earlier planning conversation. **Stop reply** stops queued or running work; **Retry reply** retries a failed, stopped, or interrupted reply. You can prepare your next message while the agent is thinking. A failed send keeps your draft for retry. The latest complete plan contains the agreed decisions and is passed in full to implementation; a conversation exceeding the supported context limit blocks clearly instead of silently dropping earlier decisions.

Every started task follows T3 Code's chat layout: a full-height scrolling conversation, compact user messages, Markdown replies, and a rounded composer anchored at the bottom. Stage labels identify each attempt and its agent; test reports, execution logs, code changes, and human decisions remain available in the thread. The composer expands with your draft and shows its target agent, with icon controls for sending and stopping replies. **Jump to latest** returns to the newest reply after scrolling back through the discussion. Approvals remain separate actions above the composer. Backlog retains its creation and settings dialogs.

In Integrate and Code Review, choose the action in the composer: **Revise** reruns the current stage with your instructions, while **Send back** returns Integrate to Plan or Code Review to Integrate. The send icon and helper text identify the chosen action before submission. Code Review revisions retain their report-only permissions. Final Approval remains human-controlled: approve the result explicitly, or send a change request back to Integrate. Rework must pass implementation validation and Code Review again. **Stop reply** stops the running process tree or removes a queued attempt from execution. Completed tasks preserve their conversation and evidence; an optional retrospective adds read-only agent feedback without reopening implementation. Started tasks retain their history and workspace; only backlog tasks without agent history can be deleted.

When upgrading from column routing, stop the launcher before applying migrations and restart afterward. Open an unfinished existing task through its title or **Review step** to choose routing once after queued or running work finishes or is cancelled. Existing attempt agents and history are retained. Unfinished tasks in Test, Code Review, or Final Approval return to Integrate to produce current validation evidence; obsolete active attempts are interrupted and all historical reports remain readable. Completed tasks remain unchanged.

The worker processes one run at a time. Queued runs survive shutdown, while runs interrupted by a worker crash require explicit retry after reviewing the workspace. An offline notice appears when no worker is available; start with `python scripts/dev.py`, or run `.venv/Scripts/python.exe backend/manage.py runagentworker` separately on Windows (`.venv/bin/python` on macOS/Linux). Running Django alone does not start the worker.

Approvals are bound to both the latest result and the code snapshot. Edits after review invalidate approval, and edits after queuing block the next run. Plan and Code Review results are blocked if tracked or untracked non-ignored workspace files change; ignored test caches can be generated. CLI tool permissions still apply, and CLIs run as the current OS user. Worktrees containing submodules or nested repositories are not supported yet. Required dependencies must be prepared in the task worktree before validation can succeed.

Logs retain the last 128,000 characters per run. JSONL records are limited to 2 MiB and total CLI output to 20 MiB; exceeding these limits fails the run. The review dialog previews up to 64,000 characters of code changes and identifies truncated diffs so the full workspace can be reviewed separately.

Adapters use [Codex non-interactive JSON output](https://learn.chatgpt.com/docs/non-interactive-mode), [Claude Code's structured headless interface](https://code.claude.com/docs/en/headless), and [Pi's JSON mode](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/cli.md). Windows npm wrappers are resolved to their underlying Node entry points, keeping prompts off command shells. For nonstandard installations, `TORCHBEARER_CODEX_COMMAND`, `TORCHBEARER_CLAUDE_COMMAND`, and `TORCHBEARER_PI_COMMAND` accept JSON arrays containing an executable and fixed arguments; shell-script overrides are rejected. Set these only in the launcher's environment, never through the task UI.

## Engineering practices

Each column applies built-in engineering practices adapted from Matt Pocock's skills. Plan defines acceptance criteria and test boundaries; Integrate implements and validates; Code Review independently checks Standards and Spec and presents the implementation's validation evidence for final approval. **Refine task** optionally starts a read-only discovery session in Backlog; answer its questions in the review dialog and start planning once it is ready. Refinement creates the task workspace, fixes the project and agent choices, and retains its history. Completed tasks offer **Run retrospective** in their history dialog; it suggests follow-up work without changing accepted code or starting more tasks. No global skill installation is required. See [engineering practices](docs/engineering-practices.md) for the stage mapping and adaptations.

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
