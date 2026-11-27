# Operations board implementation plan

Status: Implemented and locally verified. Base: `a2e9f18`.

Replace the five-column Kanban view with the approved Operations concept: a compact
task board, task-specific route previews, an expanded selected-task flow, and an
inspector containing evidence and the next human action. Keep Torchbearer's green
surfaces, gold actions, task conversations, durable execution history, and explicit
approval boundaries.

The first usable milestone is an Operations board over the existing execution
engine. Later commits connect the workflow catalogue to tasks and add distinct
procedures, including discovery that produces a reviewed decision. This ordering
lets the interface improve before changing the agent result contract.

## Product behavior

- Keep `/` as the landing URL and rename its navigation label and document title
  from Kanban to Operations. Keep Workflows and Settings at their current URLs.
- Present Backlog, Active, Needs you, and Done as derived board groups. Retain the
  existing execution-stage identifiers and show the current stage on each card.
- Show task title, project, workflow, current owner, execution state, and a compact
  route on every card. Expand descriptions and secondary metadata on demand.
- Selecting a started task opens its workspace below the board and its inspector
  on the right. Flow, Conversation, and Changes share the selection and action
  state; the existing conversation keeps its full-height focus mode for long work.
- Keep unstarted task settings and New task as dialogs. Add a work-type selector
  and preview its assigned workflow alongside the existing approach and agent
  selectors. Default new tasks to Small change / routine maintenance.
- Include project filtering, task search, a Board/Activity switch, and an agent
  summary. Counts describe the filtered task set; worker availability remains
  application-wide. Agent rows report task activity and CLI availability rather
  than suggesting that each CLI is an always-running service.
- On wide screens, show the board, selected flow, and evidence inspector together.
  At narrower widths, stack the inspector beneath the selected workspace; on
  phones, present board groups vertically and the flow as an ordered vertical route.

### Board grouping

Evaluate these rules in order in one backend projection shared by cards and counts.
Board grouping is separate from `Task.status` and is never directly writable.

| Group | Rule |
| --- | --- |
| Done | `completed_at` is set. A retrospective can show separate activity without reopening the task. |
| Active | The latest applicable attempt is queued or running, including Backlog refinement. Distinguish queued, running, cancelling, and worker offline. |
| Needs you | A result awaits approval or an answer; a run is blocked, failed, cancelled, or interrupted; Final Approval is pending; or required routing/recovery information is missing. |
| Backlog | The task has not started and has no outstanding agent result or recovery action. |

A successful refinement belongs in Needs you until the user starts planning or
continues refinement. A recorded send-back changes the task's actual stage and
queues work through the existing action service. Completed tasks take precedence
over support attempts; historical failures do not override a later valid result.

The inspector identifies the decision precisely: approve plan, approve validation,
approve review, give final approval, answer a question, retry, or request revision.
Show unavailable actions with their reason. The action service remains authoritative
when a click races a worker update, another tab, or an external workspace edit.

### Workflow meaning

Each task retains a workflow snapshot containing stable step IDs, stage membership,
labels, expected outputs, validation requirements, and human gates. Work type
selects the catalogue assignment; Frontier, Hybrid, and Local Only select the agent
for each stage. Workflow identity and routing remain separate choices.

Use the existing Plan, Integrate, Code Review, and Final Approval transitions as the
execution and approval boundaries. Workflow steps inside a stage describe that
stage's procedure; each step does not launch a separate agent process. Map each of
the 15 catalogue workflows into these boundaries explicitly, including repeated
test-first cycles and conditional checks where applicable. Catalogue descriptions
of production operations remain instructions and never grant additional external
actions or bypass human gates.

Examples required for acceptance:

- Spec-driven development shows specification, implementation slices, applicable
  contract checks, and review against the specification.
- Diagnosis and regression shows diagnosis, reproduction, correction, regression
  validation, and review.
- Test-driven development shows the test/implementation/refactoring cycle without
  inventing a record of every iteration.
- Discovery and design review shows question framing, investigation, comparison,
  a recommendation, independent decision review, and final human acceptance. Its
  result is a decision artifact retained in the conversation; implementing that
  decision is a separately created task.

All existing stage approvals remain explicit. Discovery uses workflow-specific
labels for the same underlying boundaries, such as Investigate and Review decision.
It stays associated with a Git project in this release so workspace fingerprints
and repository context retain their existing meaning.

### Displayed evidence and history

- Derive queued/running stage state from the worker and recorded attempt. Show
  recorded step outcomes only when a validated structured report supplies them.
  A running stage does not establish which internal step is currently executing.
- A step without an observation is Planned or Not reported. Do not infer completion
  from its position, elapsed time, log phrases, or a successful stage alone.
- Distinguish recorded completion, human acceptance, planned transitions, and actual
  rework. A possible return path is dashed and labeled; an observed return links to
  its Decision and attempts. Retry attempts remain inspectable.
- Bind evidence to its source run and revision. A new revision or send-back
  invalidates downstream acceptance on the current route while preserving earlier
  evidence in history. Choose current evidence from the latest applicable attempt
  in the current approved-plan lineage, so an older successful attempt cannot hide
  a newer failed revision. Final approval still checks the current workspace.
- Build test summaries from reported command outcomes. Do not display a count of
  individual tests unless that count is explicitly available. Keep failed and
  not-run commands visible, along with truncated diffs or logs.

This release keeps sequential execution and two-second polling. Arbitrary workflow
editing, freeform graph layout, parallel scheduling, real-time multi-user sessions,
and progress percentages are outside its scope. The graph uses accessible DOM nodes
and a small SVG connector layer; fixed stage ordering does not need a graph editor
dependency.

## Data and API design

Keep `Task`, `AgentRun`, and `Decision` as the sources of execution history. Add
task-workflow associations and profile metadata without introducing a second stored
board status or duplicating run history in graph tables.

- Add `definition_version` and validated `execution_profile` fields to
  `WorkflowDefinition`. Retain the existing human-readable catalogue fields and
  work-type assignment API. Built-in profile versions increase when behavior changes.
- Add nullable, protected `Task.work_type` and a `Task.workflow_snapshot` JSON field. A snapshot
  includes schema version, workflow key/name/version, selected work-type metadata,
  procedure nodes, stage labels, gates, validation, outputs, and execution mode.
  Agents are resolved separately; queued attempts retain their actual agent.
- Resolve the assigned workflow and create the snapshot atomically when the user
  selects a work type. Before agent work starts, changing the work type or choosing
  Refresh workflow explicitly replaces it using a revision-checked update. A
  catalogue assignment change never silently replaces a task's snapshot.
- Lock work type and snapshot at the first refinement or planning action, alongside
  routing and repository. Persist the snapshot and result-contract version in each
  new run's input context for reproducible handoffs.
- Use versioned result contracts. Preserve the current four-field result envelope
  for historical and already queued attempts. New profiled runs add bounded
  `workflow_steps` and `artifacts` fields; validate step IDs, stage membership,
  allowed outcomes, duplicate entries, evidence references, and required outputs.
  Step outcomes are complete, blocked, failed, not_run, or not_applicable; the last
  requires a reason and is allowed only for checks the profile marks conditional.
- Store new reports in existing `AgentRun.result` JSON. Keep step evidence tied to
  a specific attempt, not one mutable completion flag shared across retries.

Add `GET /api/v1/operations/` for compact cards, board counts, agent activity, and
worker availability. Filter by optional project and task-text query; apply identical
filters to cards and counts. Prefetch latest attempts and avoid one history query
per card. The response includes the applied filters and an observation timestamp.

Add `GET /api/v1/tasks/<uuid>/flow/` for the selected task's snapshot, projected
nodes/edges, relevant attempts/decisions, evidence references, and next-action
descriptors. Include task revision and latest run ID. Its first version supports
legacy tasks with the existing stage route; later versions add profiled steps.

Reuse the existing task action, cancellation, runs, and workspace endpoints. Action
descriptors identify actions and their prerequisites without replacing server
validation or promising that a previously read workspace fingerprint is still
current. Load logs, conversation history, and diffs only for the selected task.

Use one frontend polling coordinator with abortable requests, no overlapping poll
cycles, and protection against stale responses. Reconcile selected detail with the
overview's revision/run ID before enabling actions. On failure, retain the last
successful view, show its stale state, and retry. Mutations refresh the overview
and selected detail together without resetting selection, scroll, or composer drafts.

### Existing data

Create a frozen Legacy engineering workflow snapshot for existing tasks, including
unfinished, queued, interrupted, and completed tasks. Leave their work type unset;
never infer it from a title or associate old reports with unobserved catalogue steps.
Retain their statuses, routing, attempt agents, workspaces, results, and decisions.

Legacy snapshots continue using the existing prompts and result validation on every
subsequent attempt. Unstarted tasks can explicitly select a catalogue workflow;
started tasks keep their legacy snapshot. New profiled contracts apply only to tasks
that deliberately receive a supported profile. Migrations do not restart or advance
tasks. Stop the launcher and worker before applying schema migrations.

## Prerequisites

No prerequisite Git commits outside this change are needed. The current base already
contains the workflow catalogue, routing policies, conversation UI, worker, and
review protections.

Before implementing or running checks in each worktree, run `python scripts/setup.py`
there to create its own `.venv`, install pinned dependencies, and apply migrations.
Commit completed chunks locally. The user handles pushing and opening pull requests.

## Ordered proposed commits

Each commit depends on the preceding commit. Add its focused behavior tests with
the implementation; the final commit supplies release-wide acceptance coverage.

### 1. `feat: project task execution into operations states`

- **Frontend:** **No changes.**
- **Backend:** Add a shared operations projection and the overview/flow read APIs over existing stages, runs, decisions, and worker state. Return board groups, precise attention reasons, responsible/next agents, permitted action descriptors, filtered counts, and bounded route summaries.
- **Database:** **No changes.**

Primary files: new `backend/tasks/operations.py`, task serializers/views/URLs, and
`test_operations.py`. Cover the complete grouping precedence, refinement and
retrospective behavior, both frontier agents, Local Only, missing routing, worker
offline, stale observations, and bounded query counts on mixed-task fixtures.

### 2. `feat: replace kanban with the operations overview`

- **Frontend:** Rename Kanban to Operations and render the four board groups, compact routing previews, project/search controls, counts, worker status, and agent activity. Extract shared task creation/settings behavior and polling so existing actions and dialogs remain usable during the transition.
- **Backend:** **No changes.**
- **Database:** **No changes.**

Primary files: `frontend/src/app/App.tsx`, `features/tasks/Board.tsx`, `api.ts`,
`taskCardStatus.ts`, new overview components/polling hook, and feature styles using
the existing design tokens. Verify navigation at `/`, task creation/deletion,
filter/count consistency, recovery from failed polls, keyboard access, and 320px
layout; preserve project and routing drafts.

### 3. `feat: add task flow and evidence workspace`

- **Frontend:** Add the selected-task Flow, Conversation, and Changes workspace plus the evidence inspector, using recorded stage history and current approval actions. Reuse the conversation/composer and revision guards, retain a focus mode, and show explicit approval gates, owners, attempts, and rework paths.
- **Backend:** **No changes.**
- **Database:** **No changes.**

Primary files: extract data/actions from `TaskWorkflow.tsx` into shared hooks and
components; reuse `WorkflowConversation.tsx`; add `TaskFlow.tsx` and
`DecisionInspector.tsx`. Avoid copying approval logic into a second component.
Verify double clicks, stale fingerprints, tab switches, selection changes while a
request is pending, revision drafts, review send-backs, cancellation, and final
approval. Keep a text/ordered-list equivalent for the graph and focus restoration.

Commits 1 through 3 form a usable Operations milestone with the existing workflow.

### 4. `feat: snapshot engineering workflows on tasks`

- **Frontend:** **No changes.**
- **Backend:** Define and validate versioned built-in execution profiles, add snapshot resolution, and support revision-checked work-type selection/refresh through task creation and settings. Gate profile activation on supported execution/result versions while existing clients continue creating legacy tasks during this preparatory commit.
- **Database:** Add workflow version/profile fields and task work-type/snapshot fields, seed the built-in profiles, and backfill immutable legacy snapshots. Preserve catalogue assignments, all task stages, queued runs, and historical evidence.

Primary files: `backend/workflows/models.py`, catalogue serializers and new profile
definitions; `backend/tasks/models.py`, serializers and `update_settings`; new
workflow/task migrations. Test frozen migration data, upgrade/restart persistence,
assignment races, changed defaults, snapshot locking at refinement/start, and safe
handling of unsupported profile versions. Until commits 5 and 6 activate a mode,
reject selecting it explicitly rather than executing it with legacy semantics.

### 5. `feat: execute workflow procedures with structured evidence`

- **Frontend:** **No changes.**
- **Backend:** Activate code-change profiles and supply their procedures, validation, and outputs to planning, implementation, review, and retrospective handoffs. Introduce versioned structured step/artifact reports across all three CLI adapters and project attempt-bound evidence into the flow API.
- **Database:** **No changes.**

Primary files: `prompts.py`, `practices.py`, `adapters.py`, `worker.py`,
`workflow.py`, `operations.py`, and deterministic CLI fixtures. Keep the approved
plan and required evidence in full, retain code-change validation requirements,
and reject invalid or missing required step reports before a run can succeed.
Update every result-schema consumer, including CLI schema files, Claude's schema
argument, Pi prompt context, review validation, and retry/recovery paths.

Validate legacy and profiled tasks through all agents/approaches, long planning and
retry histories, unknown/duplicate steps, wrong-stage evidence, malformed artifacts,
partial reports, nonapplicable checks with reasons, failed/not-run validation,
cancellation, and interruption. Explicitly keep unreported internal steps out of
live progress claims. After activation, API-created tasks that omit work type can
use the maintenance default; legacy snapshots keep their contract.

### 6. `feat: support discovery workflows that deliver decisions`

- **Frontend:** **No changes.**
- **Backend:** Activate the discovery profile with read-only investigation, structured findings/options/recommendation artifacts, and independent decision review. Resolve execution permissions and validation from the trusted profile plus stage, preserving explicit approvals and existing code-change protections.
- **Database:** **No changes.**

Replace stage-only permission decisions in `adapters.py`, `worker.py`, and
`routing.py` with a shared execution-policy resolver. Update prompts and all
validation/handoff call sites so discovery is not required to manufacture code
changes or passing test commands. Reject workspace mutation during its execution
and review; final acceptance remains bound to the reviewed artifact/run and current
workspace. Reviewers can request another investigation through the existing rework
actions. Emit workflow-specific stage/action labels from the flow projection.

Test discovery end to end for Frontier, Hybrid, and Local Only: the existing routing
policy still determines who investigates and reviews. Cover empty or incomplete
decision artifacts, insufficient evidence, read-only violations, unavailable agents,
revision, send-back, final acceptance, and retrospective behavior. Existing code
tasks must continue requiring their original implementation validation.

### 7. `feat: select workflows and display task specific routes`

- **Frontend:** Add work-type selection, assigned-workflow preview, explicit refresh, and locked-workflow explanations to task creation/settings. Render catalogue-specific mini routes, detailed procedure nodes, workflow labels, and discovery evidence using snapshots and recorded reports.
- **Backend:** **No changes.**
- **Database:** **No changes.**

Reuse the existing work-type/catalogue API rather than maintaining another mapping
in React. Keep the default selection and project/agent drafts through failed saves
and dialog dismissal. Make the Workflows page explain that assignment changes affect
subsequent selections, while existing tasks retain snapshots. Verify feature,
regression, test-driven, discovery, and legacy routes side by side, including custom
catalogue assignments, stale settings, changed defaults, and unknown-version errors.

Commits 4 through 7 make workflow differences operational and reach the concept's
task-specific routing and discovery behavior.

### 8. `feat: add operations activity and handoff history`

- **Frontend:** Implement the Activity view and recent-activity inspector with links to tasks, source attempts, evidence, and human decisions. Apply the same project/search scope as the board and preserve selected task and drafts when switching views.
- **Backend:** Add a bounded activity read API built from persisted run lifecycle timestamps and decisions, with stable event IDs, deterministic ordering, and cursor pagination. Include the source task revision/run ID and the agent or human actor; keep logs out of the overview feed.
- **Database:** **No changes.**

Use a total ordering of event time, event kind, and source ID for pagination, with a
snapshot cutoff in the cursor so later lifecycle events do not disturb older pages.
The feed describes recorded lifecycle events, not a reconstructed stream of internal
agent actions. Verify tied timestamps, retry cycles, cancellations, completed-task
retrospectives, filter scope, pagination, and repeated polls without duplicates.

### 9. `test: verify operations workflows and document the upgrade`

- **Frontend:** Add release acceptance coverage for mixed workflows, responsive layouts, accessible flow navigation, all approval/recovery actions, and polling/selection races. Update navigation, board, routing, conversation, and styling assertions to the final Operations behavior.
- **Backend:** Complete upgrade, persistence, execution-policy, adapter-contract, projection, and action-race coverage, then update README and architecture documentation with the shipped APIs and workflow semantics. Record actual verification results and retain existing process-recovery guarantees.
- **Database:** **No changes.**

Use deterministic fake agent CLIs and disposable task repositories. Include an
upgrade fixture containing backlog, queued, interrupted, successful-but-unapproved,
completed, and legacy Test-stage history; preserve historical data without creating
unobserved successful steps. Extend the persistence check to cover workflow
snapshots, structured evidence, and final decision artifacts.

## Acceptance and validation

The release is ready when a mixed-task board lets the user identify the current
owner, execution state, next handoff, attention reason, workflow differences, and
approval evidence without opening multiple conversations. The selected flow and
inspector must agree with the source attempts, decisions, and current revision.

Verify at minimum:

- Feature, regression, test-driven, discovery, and legacy workflows retain distinct
  procedures through refresh and backend restart; later catalogue changes do not
  rewrite existing tasks.
- Card movement, graph selection, changing filters, and viewing evidence never
  queue work. Sending a conversation message can queue its intended agent reply,
  while approvals and stage advancement remain separate explicit actions.
- Every successful stage still waits for human approval. Stale results, external
  workspace edits, unavailable agents, and duplicate submissions retain their
  existing server-side protections.
- Send-back and retry show the actual new owner and attempts. Old evidence remains
  readable and cannot satisfy an invalidated current gate.
- Discovery can finish with an accepted decision and no repository edits. Code
  workflows cannot use discovery validation to bypass passing command evidence.
- Queued, offline, running, blocked, failed, cancelled, interrupted, and approved
  tasks remain distinguishable. Only the worker's actual active run shows Running.
- Board totals, sidebar activity, and detail reconcile after mutations and failed
  polls. An obsolete response cannot act on a newly selected task.
- Existing project management, catalogue assignments, GitHub settings, task drafts,
  conversation history, stop/retry actions, refinement, and retrospectives still work.
- Desktop, 1024px, and 320px layouts keep text, gates, evidence, and actions readable.
  Check keyboard navigation, screen-reader labels, reduced motion, dark/light
  palettes, long task names, dense routes, and truncated logs/diffs.

After focused tests for each chunk, run from the repository root:

```text
python scripts/check.py
python scripts/check_persistence.py
```

Run the Chromium suite from `frontend/` on Windows:

```powershell
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

Use this worktree's `.venv` for individual backend checks. Inspect captured desktop
and narrow-screen layouts against the approved concept, and record real check
results before the final local commit. A future release can add live internal-step
events or parallel execution once those capabilities have a supported runtime
contract.

## Implementation record

The nine ordered commits implement the Operations overview, selected task flow and
evidence inspector, frozen workflow profiles, structured procedure evidence,
decision-only discovery, task workflow selection, and recorded activity. Existing
conversations, human approval boundaries, support actions, and legacy history are
retained. Phone navigation moves above Operations content to keep task text usable.

The UI explicitly defaults new tasks to maintenance. For compatibility, API clients
that omit `work_type` continue to create legacy tasks. Changing a catalogue default
does not change existing task snapshots. Execution remains sequential, and internal
procedure progress comes from recorded result reports rather than simulated live
events. The flow distinguishes planned paths from recorded completion and rework.

Local verification on Windows, 2026-11-27:

- This worktree completed `python scripts/setup.py` with its own `.venv` and migrations.
- `python scripts/check.py` passed: **299 backend tests**, Ruff, Django checks,
  migration consistency, frontend formatting/linting, TypeScript, and production build.
- `python scripts/check_persistence.py` passed with disposable data and fake CLIs,
  preserving task snapshots, procedure reports, accepted decision artifacts,
  human decisions, projects, and catalogue assignments across a real server restart.
- Chromium exercised **93 scenarios**. The complete run passed 92; its old left-side
  phone-navigation assertion was updated for the new top navigation. The final
  rerun of all **39 affected board, navigation, Operations, conversation layout,
  and indicator cases passed**, including that correction, delayed selection
  responses, failed refresh recovery, and drafts retained while filtering.
- Final frontend formatting, linting, and production build passed after the selection
  fix. Desktop and phone screenshots were inspected; browser coverage includes
  320px layouts, 200% text, keyboard controls, both themes, and reduced motion.

All commits are local. No remote publication or authenticated agent execution was
used for verification.
