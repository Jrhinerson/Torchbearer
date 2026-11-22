# Task agent routing and code review

Status: Implemented locally. Verification and implementation notes are recorded below; commits remain local for the user to publish.

Replace the shared column assignments with routing chosen for each task when it is created. Each task follows Frontier, Hybrid, or Local Only through planning, implementation, testing, and a new Code Review column before human Final Approval.

## Agreed behavior

The New Task approach dropdown defaults to **Frontier**. Frontier and Hybrid also show a frontier agent dropdown offering **Codex** and **Claude Code**, defaulting to Codex. Local Only uses **Pi** and hides the frontier selector. These are agent CLI selections; underlying models continue to come from each CLI's configuration.

| Approach | Plan | Integrate | Test | Code Review |
| --- | --- | --- | --- | --- |
| Frontier | Selected frontier agent | Selected frontier agent | Selected frontier agent | Selected frontier agent |
| Hybrid | Selected frontier agent | Pi | Pi | Selected frontier agent |
| Local Only | Pi | Pi | Pi | Pi |

Pi reuses its existing model configuration. Configuring or verifying local inference is separate work; Local Only means that Torchbearer routes every agent stage to Pi.

Routing can be edited while a task is in Backlog and becomes immutable when planning starts. Selecting routing or creating a task does not start execution. Each queued attempt retains its recorded agent, including when the worker restarts; unavailable agents produce a clear blocked/error state rather than a silent substitution.

The board order becomes Backlog, Plan, Integrate, Test, Code Review, Final Approval. Keep the existing human approval gates: each successful stage waits for approval before the next run is queued. Approving Code Review moves the task to Final Approval, where the human records completion.

## Routing and workflow design

Store only `routing_mode` and `frontier_agent` on the task. Frontier and Hybrid require `codex` or `claude`; Local Only stores no frontier agent. Put the agent and working-stage enums outside `ColumnAssignment`, and use one small backend resolver to derive the agent for a task and stage from the table above.

Expose the resulting stage agents as read-only task data if needed by the interface. The frontend displays the backend's resolution instead of maintaining a second policy implementation. Keep the existing agent catalog and worker availability response, replacing global assignments with agent classifications and supported task approaches.

Validate creation and routing updates at the API boundary. A new task without explicit routing uses Frontier and Codex; an explicitly invalid combination fails validation. Backlog edits and the start action must use an atomic revision check so a concurrent edit cannot change routing after work starts. Attempts continue to snapshot their selected agent when queued.

Use `code_review` as the new working-stage identifier. Code Review inspects changes against the approved plan, acceptance criteria, and passing test evidence, and reports actionable findings with file references. Its successful outcome requires no unresolved findings that block acceptance. It reports failure for changes that need rework and blocked when it lacks the context or access needed to review.

Code Review reports findings without changing workspace files. Extend adapter tool permissions and the worker's before/after fingerprint checks to cover it, following the existing Plan and Test protections. Review approval must refer to the latest successful result and current workspace fingerprint; Test still requires actual passing validation commands.

Test and Code Review rework return to Integrate through an explicit human action. After implementation changes, the task must pass Test and Code Review again. Final Approval rework also returns to Integrate, and Integrate can still be sent back to Plan when the design needs revision. Retrying or revising any stage uses the task's fixed routing policy.

## Planning and handoff requirements

Hybrid planning must give Pi enough information to implement without making unresolved architectural or product decisions. Require the planning instructions to cover:

- The requested outcome, scope, acceptance criteria, assumptions, and repository findings.
- Ordered implementation steps with concrete file paths, symbols, dependencies, and frontend, backend, and database effects where relevant.
- API and data contracts, migrations and existing-data handling, error behavior, and important edge cases.
- Validation commands, required fixtures or environment setup, expected outcomes, and the criteria the reviewer will use.
- Open questions or missing prerequisites that block implementation rather than leaving Pi to guess.

Follow the target repository's planning format. Keep the existing normalized result envelope, with the detailed plan or review in `details`, instead of introducing a second result hierarchy. Other approaches can use the same planning structure.

Implementation and testing receive the full latest human-approved plan, relevant human feedback, and the current rework findings. Code Review receives that plan, the implementation report, the latest applicable successful Test evidence, and access to the complete task changes from the base commit, including new files.

Select these required artifacts explicitly rather than relying on the existing six-attempt history window. Record their run IDs and content in the existing persisted input context, and retain bounded recent history only as supplementary context. Do not silently truncate the approved plan or required evidence to fit a prompt; block with an actionable error if it exceeds the supported context limit. A truncated UI diff must not become the reviewer's only view of the changes.

## Existing tasks and upgrade behavior

Existing unfinished tasks require an explicit routing choice before a new start, retry, revision, send-back, approval, or final approval can continue their workflow. Do not infer that choice from the old global assignments, since an arbitrary legacy assignment does not necessarily match one of the new approaches.

Allow this initial choice for a legacy task outside Backlog only while it has no queued or running attempt. After that choice, apply the same routing lock as for every other started task. Queued attempts retain their recorded agent and may finish; cancellation and history inspection remain available while a routing choice is pending. Interrupted attempts retain the existing explicit-retry behavior.

Preserve all runs, agent identities, results, human decisions, workspaces, and completed tasks. Completed tasks remain historical records and do not need a routing choice or a retroactive Code Review. Their existing Test-based final approval remains readable.

For unfinished legacy tasks already in Final Approval, migrate their status back to Test and increment their revision. Keep their existing Test result and history, so after choosing routing the human can approve that result to start Code Review; stale or unsuccessful results still need the usual retry or revision. This avoids inventing a successful review or maintaining an alternate completion path.

Apply migrations with the launcher and worker stopped, then restart them. Preserve the existing recovery semantics rather than rewriting queued or previously running attempts during migration.

## Prerequisite commits outside this change

None. The current branch already includes column routing, the CLI adapters, durable runs, retained task worktrees, reviewed transitions, and the styling system.

## Ordered proposed commits

Each commit depends on the preceding commit. Implementation commits remain local; the user handles pushing and opening a pull request.

### 1. `feat: model task routing policies and agent roles`

**Frontend:** No changes.

**Backend:** Introduce shared agent classifications and working-stage definitions, routing validation, and one task-to-stage agent resolver. Add focused coverage for every approach and both frontier choices while leaving the current execution path intact for this preparatory commit.

**Database:** Add task routing fields and constraints for valid mode and agent combinations, with an unset state reserved for existing tasks. Preserve legacy tasks without assigning a policy, and ensure new task creation defaults to Frontier and Codex.

### 2. `feat: choose and execute routing per task`

**Frontend:** Add the approach and conditional frontier selectors to task creation, show task routing on cards and in task details, and support Backlog edits plus the initial routing choice for unfinished legacy tasks. Replace column selectors with task-level controls, preserving drafts, accessible labels, and useful save or availability errors.

**Backend:** Switch every newly queued attempt to the task resolver, expose the resolved agents, and add atomic routing updates with the start-time lock and legacy-choice rules. Replace assignment-driven availability checks and stop accepting global assignment writes while retaining the agent catalog and worker status.

**Database:** No changes.

### 3. `feat: provide detailed plans and explicit agent handoffs`

**Frontend:** No changes.

**Backend:** Strengthen planning instructions for local implementation and select the approved plan, relevant implementation and test results, and rework feedback explicitly. Persist their identities and full required content in existing run context, with clear failures for missing or oversized handoffs and tests that cover long retry histories.

**Database:** No changes.

### 4. `feat: add agent code review before final approval`

**Frontend:** Add Code Review after Test and update progression, review results, retry and rework controls, and the six-column responsive layout. Make the reviewing agent visible and distinguish agent Code Review from human Final Approval.

**Backend:** Add review prompts, adapter permissions, fingerprint enforcement, and task-resolved execution for the new stage, with Test advancing to Code Review and Code Review advancing to Final Approval. Enforce review evidence, preserve explicit human gates, and send rework through Integrate, Test, and Code Review again.

**Database:** Extend task and run stage choices with `code_review`, and migrate unfinished legacy Final Approval tasks back to Test with a revision increment. Preserve completed tasks and all historical runs and decisions.

### 5. `test: verify task routing migration and reviewed execution`

**Frontend:** Replace column-assignment browser scenarios with coverage for creation defaults, both frontier agents, Hybrid and Local Only execution, routing isolation between tasks, Backlog editing, and locked started tasks. Cover Code Review rework, legacy routing selection, error recovery, keyboard access, and narrow layouts, and update user-facing documentation.

**Backend:** Add migration and workflow regressions for existing data, preserved queued agents, missing routing, concurrency, required review evidence, stale fingerprints, cancellation, and recovery. Update deterministic fake CLI fixtures and persistence checks to exercise the complete four-stage flow and document the new API and upgrade behavior.

**Database:** No changes.

### 6. `refactor: remove legacy column routing and simplify task execution`

**Frontend:** Delete the unused column-agent selector, assignment mutations and types, assignment-based workflow branches, and obsolete selector styling and tests. Keep small task routing controls that use the existing form primitives, and separate the still-used repository picker from obsolete routing code.

**Backend:** Remove `ColumnAssignment` runtime dependencies, assignment views and routes, the old assignment lookup, and any temporary compatibility logic left by the cutover. Consolidate stage transitions, agent metadata, and prompt selection around the single task policy resolver and existing worker rather than adding a configurable routing engine.

**Database:** Add a forward migration deleting the unused column assignment table after all runtime references are gone. Retain historical migration files so both fresh installation and upgrades continue to work.

## Acceptance and verification

- New tasks default to Frontier and Codex, and retain their chosen approach through reloads and restarts. Choosing Claude Code changes every frontier-owned stage for that task.
- Verify the full routing table, including that Hybrid never assigns implementation or testing to a frontier agent and Local Only never invokes Codex or Claude Code.
- Two tasks with different approaches run independently of one another. Editing a Backlog task cannot alter a started task or an already queued attempt.
- Existing unfinished tasks cannot progress without choosing routing. Completed tasks remain unchanged, recorded attempt agents survive migration, and old unfinished Final Approval tasks must pass Code Review.
- A successful workflow records Plan, Integrate, Test, and Code Review attempts before final approval. Failed Test or Code Review results require human-directed rework, followed by fresh testing and review.
- Required handoff artifacts remain available after more than six attempts. Missing or oversized required context blocks clearly, and reviews cannot substitute stale Test evidence for the current implementation.
- Plan, Test, and Code Review cannot succeed after changing covered workspace files. Stale approvals, duplicate actions, cancelled runs, and worker interruption retain their existing protections.
- After cleanup, search the runtime source, active tests, and current operational documentation for old assignment names and endpoints; only historical migrations, upgrade test fixtures, and earlier implemented plans may retain them. Confirm that no global assignments are queried or written.
- Run the portable checks with `python scripts/check.py`, restart persistence with `python scripts/check_persistence.py`, Chromium coverage with `npm.cmd run test:e2e` from `frontend`, and launcher verification with `python scripts/check_launcher.py` in a supported terminal. Use isolated databases and fake CLIs, and rerun the relevant checks after the final cleanup commit.

All feature commits include focused tests for the behavior they introduce. The verification commit adds cross-feature and upgrade coverage; cleanup preserves the resulting behavior.

## Implementation and verification

- Added task policies with Frontier and Codex defaults, Backlog editing, immutable routing after start, and an initial routing choice for unfinished legacy tasks. Resolved stage agents and the next stage come from the backend.
- Added detailed planning instructions, explicit approved artifacts and rework findings in persisted handoffs, and Code Review with passing Test evidence tied to the current implementation and workspace.
- Added forward migrations that preserve recorded attempts and completed tasks, require routing choices for legacy tasks, return unfinished Final Approval tasks to Test, and remove the obsolete column assignment table.
- Removed the assignment API, column selector, unused agent icon assets, and selector styles. The repository picker is independent, and Backlog routing edits use an expandable control with the existing form primitives.
- The complete backend suite passed 87 tests after cleanup, including upgrades from the previous schema, database constraints, durable handoffs, stale evidence, cancellation, and hard worker-death recovery. Portable static, formatting, migration, TypeScript, lint, and production-build checks passed; frontend lint was rerun cleanly after moving the shared label helper out of the component file.
- Restart persistence and launcher startup/shutdown passed against the final migrations using isolated data. Agent execution tests use deterministic fake CLIs; authenticated real-model runs were not performed.
- All 27 Chromium browser tests passed after cleanup, covering all approaches and both frontier agents, Backlog edits and save recovery, legacy routing selection, Code Review rework, cancellation, stale approvals, keyboard use, narrow screens, and increased text size. Reviewed the resulting desktop board and mobile task popup screenshots.
