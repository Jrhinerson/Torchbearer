# Torchbearer

Torchbearer is a local operations board that helps individual developers retain ownership of engineering decisions while coordinating coding agents.

The application uses React and TypeScript for its interface, Python and Django for its backend, and SQLite for persistent local storage.

The first implementation is described in [the foundation plan](docs/plans/001-app-foundation.md). Project planning conventions are recorded in [AGENTS.md](AGENTS.md).

## Start locally

Prerequisites: Python 3.14, Node.js 24 or newer, and npm. Local verification used Node.js 26. On macOS/Linux, use `python3.14` in place of `python` if necessary.

From the repository root:

```text
python scripts/setup.py
python scripts/dev.py
```

Open **http://127.0.0.1:5173**. Operations groups tasks into **Backlog**, **Active**, **Needs you**, and **Done**. Click **New Task** in the header to choose a work type, preview its assigned workflow, and create a task. Tasks remain after refresh or restart. Cancel, Escape, or the close button retains the draft. Expand an unstarted backlog card to use its delete action. Ctrl+C stops all services; Ctrl+Break is also supported on Windows. Start Django and the worker without Vite with `python scripts/dev.py --backend-only`.

Use the left sidebar to navigate between **Operations** (`/`), **Workflows** (`/workflows`), and **Settings** (`/settings`). Search and project filters update board counts and activity together. Select a started task for its **Flow**, **Conversation**, **Changes**, and evidence inspector; **Focus workspace** expands the same workspace and retains conversation drafts. The activity feed records attempts and human handoffs. Agent rows show CLI availability and queued/running task counts. Each URL supports refresh and browser Back/Forward navigation.

Setup creates `.venv/`, installs the pinned Python requirements and frontend lockfile, and applies migrations without replacing existing data. Startup checks ports and unapplied migrations, then starts Django, the agent worker, and Vite together. After a schema change, rerun setup or apply migrations explicitly. Use `--backend-port` and `--frontend-port` with the launcher when the default ports are occupied; separate app instances also need separate data directories.

Vite refreshes frontend edits automatically. Restart the launcher after editing Python code; Django's automatic reloader is disabled so the launcher can reliably manage its process tree. These commands start local development services.

## Populated demo

To inspect a busy board without running agents, launch `python scripts/demo.py`.
It serves the read-only demo at **http://127.0.0.1:5174** (backend 8001), using a
fresh temporary database with 40 fictional tasks, varied procedures, recovery states,
and discovery artifacts. API writes and worker startup are disabled. Stopping the
demo removes its temporary data; normal application data is separate. Override
ports with `--frontend-port` and `--backend-port`.

Run its isolated browser acceptance check with `npm run test:e2e:demo` from `frontend/`.
It captures the actual populated board and verifies phone layouts and read-only behavior.

## Projects in New Task

Choose **Project** to search saved projects by name or folder, then select one for the task. A Git project with an initial commit also supplies the repository used for agent execution. **No project** keeps a task unassigned. The selection stays with the draft when you dismiss the popup and stays selected for subsequent tasks until you change it. Existing registered repositories and their task selections are retained as saved projects when upgrading.

Use **Add Project** to open the local folder explorer. Navigate with Home, available common-folder and drive shortcuts, breadcrumbs, or **Parent folder**. Open a folder, then choose **Use this folder** and **Add and select project**. Git repositories and linked worktrees appear first with a **Git repository** marker; ordinary folders are also supported. **Filter folders** searches the current location, and **Enter a path** is an optional shortcut. **Change folder** reopens the selected location, while Cancel or Escape returns to the task draft.

Alternatively, choose **Clone a Git URL**, enter an HTTPS or SSH clone URL and the full path to a new destination folder, then **Clone and select project**. **Browse parent** opens the same explorer to choose an existing parent and suggests a destination using the repository name. The machine running Django supplies the folders, Git installation and Git credentials. Cloning is noninteractive and times out after two minutes; an existing destination is never overwritten. Repository search and using the Settings connection for cloning are future work.

Project names default to the folder name. Adding a project selects it while keeping the task title and description. **Manage projects** provides rename and removal controls. Renaming updates existing task labels; removal hides the project from the picker while keeping its files and task history. Adding the same folder again restores the saved project. A project association does not execute any work.

## GitHub connection

Open **Settings → Connections** and choose **Connect GitHub**. Torchbearer requests a one-time code and opens GitHub in a new browser tab. Copy the code from Settings, enter it in GitHub, and sign in to the account you want to connect before approving access. Settings automatically displays the verified username after authorization. If your browser blocks the new tab, use **Continue on GitHub**. Sign-in codes expire after 15 minutes; **Cancel sign-in** stops the attempt.

Sign-in uses Torchbearer's registered GitHub App directly over HTTPS. GitHub CLI is not required. The publisher supplies the app's public Client ID once before distributing a release; end users only authorize the app. The current source has no registered publisher ID yet: follow [publisher registration and configuration](docs/github-app.md) before the first live sign-in. Device authorization requires no client secret or private key.

**Change account** starts a fresh browser authorization and replaces the connection only after successful verification and secure credential storage. Opening Settings or choosing **Check connection** verifies the saved account and automatically refreshes expiring tokens. **Reconnect GitHub** appears when authorization is missing, expired, or revoked. Earlier connections created through the CLI also require fresh consent for Torchbearer's app. **Disconnect** removes this app's saved credentials and connection; revoke the app's grant separately through GitHub's authorized GitHub Apps settings if desired.

Account identity persists in SQLite; access and refresh tokens live only in Windows Credential Manager, macOS Keychain, or Linux Secret Service through the bundled `keyring` dependency. An unavailable/locked system store produces an actionable message; there is no plaintext fallback. Tokens and GitHub's private device code are never returned to the frontend. Moving the database to another machine requires a new sign-in. An unfinished login can survive navigating away or refreshing Settings while Django remains running; start a new sign-in after a backend restart.

The connection currently records and validates the selected GitHub account. Project cloning and agent CLIs retain their existing authentication behavior.

## Configuration and data

| Setting | Default | Purpose |
| --- | --- | --- |
| `TORCHBEARER_DATA_DIR` | `.local/` | Local directory containing `torchbearer.sqlite3`. |
| `DJANGO_DEBUG` | `1` | Django development diagnostics; use `0` to disable. |
| `DJANGO_SECRET_KEY` | Local development value | Override Django's development signing key. |
| `TORCHBEARER_RUN_TIMEOUT` | `1800` | Maximum CLI execution time in seconds for a single run. |
| `TORCHBEARER_GITHUB_CLIENT_ID` | Bundled public GitHub App Client ID (unset in source) | Publisher/deployment override for native GitHub sign-in; see [registration](docs/github-app.md). |

The backend listens at `127.0.0.1:8000`. Vite forwards `/api/` requests to it; its own port is fixed at `5173`. The service health endpoint is `/api/v1/health/`.

SQLite files, environment files containing secrets, dependency directories, builds, and test artifacts are ignored by Git. Data persists on disk rather than in browser state. To back up backlog records and routing configuration, stop the application and copy `.local/torchbearer.sqlite3`. Started tasks also need their worktrees and the original repositories' Git metadata; back up those together with the database to preserve executable workspaces.

## Workflow assignments

Open **Workflows** to manage application-wide defaults for 19 work types and 15 built-in engineering workflows. Work types appear alphabetically in up to three columns, reducing to two or one as available width narrows. Search by work-type name, description, or assigned workflow. Each card shows its saved assignment and recommended workflow.

Choose any workflow for any work type, then **Save**. **Cancel** restores the saved selection. **Use recommended workflow** prepares the original recommendation; choose **Save** to apply it. Assignments persist in SQLite across refreshes and backend restarts. Failed saves retain the selection for retry. If another tab changed an assignment, **Reload assignment** retrieves the latest saved value while keeping the chosen selection for review before saving again.

Overlapping practices share a workflow: documentation uses **Plan and execute** with documentation checks, API integration uses **Spec-driven development** with contract testing, and architecture and research use **Discovery and design review** with a reviewed decision. Distinct implementation practices retain their own workflows. See [engineering practices](docs/engineering-practices.md#workflow-catalogue) for the consolidation rationale.

New tasks snapshot their selected work type's assigned workflow, including its version, procedure, validation, and outputs. New Task defaults to **Small change / routine maintenance**. Before agent work starts, task settings can change the work type or explicitly **Refresh workflow** from the latest assignment. The snapshot locks when refinement or planning starts; changing a catalogue default never rewrites existing tasks. Workflow definitions remain built-ins.

Code workflows record procedure evidence and actual command results within the existing approval stages. **Discovery and design review** instead produces findings, source references, alternatives, a recommendation, and limitations, followed by independent decision review and explicit human acceptance. Discovery does not edit the repository. Earlier tasks retain a frozen legacy workflow and their original reports; API clients omitting work type continue to create legacy tasks for compatibility. See the [Operations plan](docs/plans/012-operations-board.md) for the implementation sequence.

## Agent routing

Choose an approach for each task in **New Task**. **Frontier** is the default, with **Codex** selected; **Claude Code** is the other frontier agent. **Hybrid** uses the selected frontier agent for detailed planning and Code Review, while **Pi** implements and tests. **Local Only** routes all three working stages to Pi using its existing model configuration; local inference setup is separate.

Click an unstarted Backlog task's title to edit its workflow, routing, or execution repository. Cards always show their title, project, workflow, attention reason, responsible agent, and expected route. Use the chevron to expand descriptions, routing details, actions, and footer. Unassigned tasks show **No project**. Expansion survives automatic updates; reloading collapses cards. Routing locks when refinement or planning starts. Each queued attempt records its own agent. Missing installations or execution failures never substitute another agent. Optional refinement and post-approval retrospectives retain their history.

Each card shows its responsible agent's logo at the far right of the title row, including while collapsed. Backlog cards show the planning agent; started cards show the recorded agent for their current stage, and Final Approval retains the reviewing agent's logo. A circular spinner appears directly left of the logo only while a run is executing. When a result awaits review, a task reaches Final Approval, or a run is blocked and needs human input, the spinner gives way to a slow gold glow around the whole card matching the selected navigation border. Queued, failed, cancelled, interrupted, and approved tasks remain still. Hovering the indicator or reading its accessible label identifies the agent and status; reduced-motion preferences replace rotation and pulsing with a steady ring or glow.

Install and authenticate each CLI you want to use, and configure its default model in that CLI. Torchbearer uses the CLI's existing authentication and model configuration. The dropdown identifies missing installations; outdated versions, missing authentication, and permission denials appear as run errors. Current adapter version requirements are Codex CLI 0.162.0+, Claude Code 2.1.259+, and Pi 0.74.0+.

1. Create a task, choose its approach and frontier agent when applicable, and select a saved Git project. Use **Add Project** to register a local folder or clone a Git URL; click an unstarted Backlog task's title to select its execution repository in settings.
2. Click **Start planning**. Torchbearer creates a branch and worktree from the repository's committed HEAD on first refinement or planning; uncommitted changes and ignored dependencies in the original checkout are not copied.
3. Open the task to plan through a conversation with the selected agent. Answer its questions, add context, and refine the plan with **Send message** (Enter to send; Shift+Enter adds a line). Messages and replies survive refreshes. Sending a message keeps the task in Plan; **Approve plan & start Integrate** explicitly approves the latest complete plan and starts implementation. The conversation continues through Integrate, Code Review, and Final Approval, preserving earlier messages and reports as the task advances.
4. Integrate implements the plan, writes tests, and runs validation, reporting actual command outcomes. Approve passing results to start Code Review, which inspects the complete task changes against the approved plan and test evidence. Every successful stage waits for human approval before advancing.
5. Approve Code Review to continue to Final Approval, then choose **Give final approval**. The task moves to **Done** with its accepted result and history. Merging and worktree cleanup remain manual.

In Plan, each message queues a read-only reply with the full earlier planning conversation. **Stop reply** stops queued or running work; **Retry reply** retries a failed, stopped, or interrupted reply. You can prepare your next message while the agent is thinking. A failed send keeps your draft for retry. The latest complete plan contains the agreed decisions and is passed in full to implementation; a conversation exceeding the supported context limit blocks clearly instead of silently dropping earlier decisions.

The selected task's Flow shows its procedure, responsible agents, human gates, and recorded attempts. Dashed paths describe expected work; completed procedure steps come from the agent's structured report, rather than inferred live activity. Selecting a node opens its evidence in the inspector, including historical attempts. Current approvals remain bound to the latest valid result.

Conversation retains the scrolling chat, Markdown replies, and anchored composer. **Focus workspace** gives it the full-height layout. Stage labels identify each attempt and agent; reports, logs, changes, and human decisions remain available. The composer expands with the draft and identifies its target agent. **Jump to latest** returns to the newest reply. Approvals remain explicit actions in the inspector or above the focused conversation's composer.

In Integrate and Code Review, choose the action in the composer: **Revise** reruns the current stage with your instructions, while **Send back** returns Integrate to Plan or Code Review to Integrate. The send icon and helper text identify the chosen action before submission. Code Review revisions retain their report-only permissions. Final Approval remains human-controlled: approve the result explicitly, or send a change request back to Integrate. Rework must pass implementation validation and Code Review again. **Stop reply** stops the running process tree or removes a queued attempt from execution. Completed tasks preserve their conversation and evidence; an optional retrospective adds read-only agent feedback without reopening implementation. Started tasks retain their history and workspace; only backlog tasks without agent history can be deleted.

When upgrading from column routing, stop the launcher before applying migrations and restart afterward. Open an unfinished existing task through its title or **Review step** to choose routing once after queued or running work finishes or is cancelled. Existing attempt agents and history are retained. Unfinished tasks in Test, Code Review, or Final Approval return to Integrate to produce current validation evidence; obsolete active attempts are interrupted and all historical reports remain readable. Completed tasks remain unchanged.

The worker processes one run at a time. Queued runs survive shutdown, while runs interrupted by a worker crash require explicit retry after reviewing the workspace. An offline notice appears when no worker is available; start with `python scripts/dev.py`, or run `.venv/Scripts/python.exe backend/manage.py runagentworker` separately on Windows (`.venv/bin/python` on macOS/Linux). Running Django alone does not start the worker.

Approvals are bound to both the latest result and the code snapshot. Edits after review invalidate approval, and edits after queuing block the next run. Plan and Code Review results are blocked if tracked or untracked non-ignored workspace files change; ignored test caches can be generated. CLI tool permissions still apply, and CLIs run as the current OS user. Worktrees containing submodules or nested repositories are not supported yet. Required dependencies must be prepared in the task worktree before validation can succeed.

Logs retain the last 128,000 characters per run. JSONL records are limited to 2 MiB and total CLI output to 20 MiB; exceeding these limits fails the run. The review dialog previews up to 64,000 characters of code changes and identifies truncated diffs so the full workspace can be reviewed separately.

Adapters use [Codex non-interactive JSON output](https://learn.chatgpt.com/docs/non-interactive-mode), [Claude Code's structured headless interface](https://code.claude.com/docs/en/headless), and [Pi's JSON mode](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/cli.md). Windows npm wrappers are resolved to their underlying Node entry points, keeping prompts off command shells. For nonstandard installations, `TORCHBEARER_CODEX_COMMAND`, `TORCHBEARER_CLAUDE_COMMAND`, and `TORCHBEARER_PI_COMMAND` accept JSON arrays containing an executable and fixed arguments; shell-script overrides are rejected. Set these only in the launcher's environment, never through the task UI.

## Engineering practices

Each execution stage applies built-in engineering practices adapted from Matt Pocock's skills. Plan defines acceptance criteria and test boundaries; Integrate implements and validates; Code Review independently checks Standards and Spec and presents the implementation's validation evidence for final approval. **Refine task** optionally starts a read-only discovery session in Backlog; answer its questions in the review dialog and start planning once it is ready. Refinement creates the task workspace, fixes the project and agent choices, and retains its history. Completed tasks offer **Run retrospective** in their history dialog; it suggests follow-up work without changing accepted code or starting more tasks. No global skill installation is required. See [engineering practices](docs/engineering-practices.md) for the stage mapping and adaptations.

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

The application supports an Operations board, frozen task-specific workflows, reviewed discovery decisions, reusable projects, per-task agent routing, isolated task worktrees, retained evidence, and explicit human approval. Desktop packaging, automatic merging, custom stage prompts, model selectors, and parallel execution remain future work.

GitHub Actions is configured for Windows and Linux. All work is committed locally; the user handles pushing and opening a PR after their approval. Hosted CI has not run as part of local implementation.
