# Agent routing with reviewed stage handoffs

Status: Implemented and verified locally. Commits remain local; the user handles publication and PR creation.

## Agreed behavior

- Plan, Integrate, and Test have compact selectors for Codex CLI, Claude Code CLI, Pi, or Unassigned. Backlog and Final Approval are human-only.
- Each task chooses a repository and retains a separate branch and Git worktree across stages.
- Entering a working column queues its assigned agent. A completed result waits for human approval before advancing.
- Integrate implements the approved plan. Test validates and reports, with failures sent back to Integrate only through a human action.
- Changing assignments affects future runs. Approvals refer to a particular attempt and code snapshot.
- Final approval marks the task approved in the existing final column. Merging and workspace cleanup stay manual.
- The initial worker processes runs sequentially and uses each CLI's configured model and authentication.

## Prerequisites outside the feature

None. The existing React/Django board and SQLite task foundation are the base.

## Ordered commits

1. `feat: configure column agents and task repositories`

   **Frontend:** Add the working-column agent selectors and per-task repository selection, with persisted settings and useful failure states.

   **Backend:** Expose the agent catalog and validated assignment/repository APIs. Repository assignment remains changeable while a task is in Backlog.

   **Database:** Store repositories, column assignments, and optional task repository references while preserving existing tasks.

2. `feat: model task stages and reviewed transitions`

   **Frontend:** No changes.

   **Backend:** Define human-controlled start, approval, revision, retry, send-back, and cancellation actions. Reject stale or duplicate transitions and retain started-task history.

   **Database:** Add workflow stages, task revisions, attempts, decisions, completion records, and one-active-attempt constraints.

3. `feat: create isolated Git worktrees for tasks`

   **Frontend:** No changes.

   **Backend:** Create and validate retained task worktrees and compute code fingerprints for approval and queued handoffs. Preview tracked and untracked changes without modifying the source checkout.

   **Database:** Store workspace path, branch, base commit, and queued input fingerprints.

4. `feat: add Codex Claude Code and Pi CLI adapters`

   **Frontend:** No changes.

   **Backend:** Normalize the three CLI protocols, enforce result/output bounds, and support timeout and process-tree cancellation. Cover protocol failures, permission denials, Unicode, and descendant cleanup with deterministic subprocess fixtures.

   **Database:** No changes.

5. `feat: orchestrate durable agent runs and stage handoffs`

   **Frontend:** No changes.

   **Backend:** Add the single-owner worker, persisted queue claims, context handoffs, report-only stage checks, and interruption recovery. Start and stop the worker with the development launcher.

   **Database:** Store worker ownership/heartbeat, run context, and CLI versions. Interrupted work requires explicit retry, while queued work remains durable.

6. `feat: add execution controls and stage review`

   **Frontend:** Show run progress, results, logs, code changes, attempt history, human decisions, and approval/rework controls. Preserve readable narrow-screen layouts and refresh state through bounded polling.

   **Backend:** No changes.

   **Database:** No changes.

7. `test: verify routing approvals and process recovery`

   **Frontend:** Add browser coverage for assignment persistence, mixed-agent approval gates, failed-test rework, cancellation, stale code reviews, and mobile layout. Give test services separate configurable ports.

   **Backend:** Add a real worker-death recovery test, complete launcher verification with temporary services, and document CLI setup and operational limits. Keep permission-denial events sticky through final-result normalization.

   **Database:** Configure immediate SQLite transactions to prevent worker/API read-to-write lock contention. Verify migration compatibility and restart persistence with isolated databases.

## Local verification

- All 48 API/domain/process tests and 13 Chromium browser tests passed. Portable static, formatting, migration, TypeScript, frontend lint, and production build checks passed.
- Chromium coverage uses temporary repositories, a temporary SQLite database, and fake CLIs; it never invokes authenticated models.
- Restart persistence and launcher lifecycle checks passed using temporary data and available ports.
- Installed CLI version checks verified Codex 0.162.1 and Pi 0.74.2. Claude Code is absent from PATH, and authenticated real-model smoke runs were not performed.

See the README and architecture notes for API contracts, version requirements, process ownership, retained workspaces, and supported workflow actions.
