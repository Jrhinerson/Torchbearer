# Editable workflow DAGs

First delivery implemented: the shared viewer/editor and Plan and execute DAG.
The remaining 14 workflow maps stay queued for individual authoring after review.

Add a **Workflow map** tab beside **Assignments** on `/workflows`. Display one
selected workflow as a directed acyclic graph (DAG), with a description and the
requirements for continuing at every node. Start with **Plan and execute**, review
and adjust it, then author each remaining workflow separately.

“One DAG at a time” applies both to the canvas and to the rollout: one selected
graph, one editor draft, and one newly authored workflow per subsequent commit.
No prerequisite commits outside this change are required. Use the current local
HEAD as the base; all commits remain local for user review.

## Proposed experience

- Keep work-type assignments in the **Assignments** tab. The **Workflow map** tab
  has a workflow selector, mapping count, graph canvas, and **Edit workflow** action.
  Preserve the selected tab and workflow in the URL, for example
  `/workflows?tab=map&workflow=plan-execute`, including refresh and Back/Forward.
- Show short requirement summaries on node cards. Selecting a node opens its full
  description, **Before moving on** requirements, expected outputs, approval
  requirements, and outgoing transitions in an adjacent panel. Distinguish checks
  required for every change from checks applicable only to particular work.
- Label arrows with the condition for continuing. Use neutral requirement bullets
  and explicit human-approval badges; these describe a definition, not completed
  work. A linear sequence is a valid first DAG; do not invent branches just for
  visual effect.
- In edit mode, allow changes to descriptions, requirements, outputs, approval
  requirements, transition labels, connections, and node positions. Provide
  **Add step**, removal with affected connections listed, keyboard/form-based
  connection controls, **Save workflow**, and **Cancel**. Draft edits appear on the
  canvas immediately and persist only after a successful save.
- Permit only one draft. While editing, lock the workflow selector; switching tabs
  or leaving the page with changes offers **Keep editing** or **Discard changes**.
  A failed save retains the draft. A stale save offers a comparison with the latest
  version, preserving the draft for manual reconciliation before another save.
- The selector lists all 15 workflows. Initially only Plan and execute is mapped;
  other choices show **Map not authored yet**, their existing catalogue description,
  and no graph editor. Each later commit enables exactly one more authored graph.
- On narrow screens, stack the inspector below the canvas and provide an equivalent
  ordered steps view. Support keyboard selection, visible focus, text descriptions
  of connections, zoom/fit controls, both existing themes, and reduced motion.

The current catalogue contains 15 workflow definitions and 19 work types. Definitions
have flat `steps`, `outputs`, `validation`, and `approval_points` lists; there is no
node-specific requirement model or workflow edit endpoint. Catalogue assignments are
currently independent of task execution. This feature edits and documents catalogue
definitions; task progression and enforcement would require a separately planned
integration. Keep that distinction visible through the concise **Workflow definition**
label, without presenting requirements as live completion controls.

## Ordered proposed commits: first delivery

1. `feat: model validated workflow graphs`

   **Frontend:** **No changes.**

   **Backend:** Define a versioned node/edge contract, authoritative DAG validation,
   and read-only graph detail responses; expose mapping availability in the catalogue.
   For mapped workflows, derive the existing list API's step/output/check/approval
   fields from the graph so edits have one authoritative definition.

   **Database:** Add nullable graph JSON, a graph revision, and a graph update timestamp
   to `WorkflowDefinition`; existing records begin unmapped. Preserve all workflow
   identities, work-type assignments, revisions, and task history.

2. `feat: author the plan-and-execute workflow graph`

   **Frontend:** **No changes.**

   **Backend:** Add a frozen, reviewed four-node definition and catalogue/migration
   coverage for its requirements, documentation applicability, outputs, and approvals.
   Confirm the mapped list representation preserves the existing catalogue meaning.

   **Database:** Seed only `plan-execute`, with stable node IDs and its initial
   revision, in a new data migration. Leave the other 14 definitions unmapped and
   retain their existing flat fields as the fallback until individually authored.

3. `feat: add the workflow map tab and node inspector`

   **Frontend:** Split `WorkflowsPage` into assignment and map panels; add a lazy-loaded
   React Flow canvas, workflow selector, requirement cards, node inspector, controls,
   and URL state. Reuse existing typography, semantic theme tokens, and feedback styles.

   **Backend:** **No changes.**

   **Database:** **No changes.**

4. `feat: save workflow graphs with revision checks`

   **Frontend:** **No changes.**

   **Backend:** Add a CSRF-protected graph PATCH accepting only the full graph and
   expected revision, with atomic compare-and-update and structured node/edge errors.
   Test valid edits, malformed and cyclic graphs, stale revisions, and unchanged data
   after rejected writes.

   **Database:** **No changes.**

5. `feat: edit one workflow graph at a time`

   **Frontend:** Add a single local edit draft, editable node and transition forms,
   add/remove/connect actions, position editing, client validation, and Save/Cancel.
   Preserve unsaved work on failures and conflicts, guard navigation, and verify
   persistence and cancellation with focused browser scenarios.

   **Backend:** **No changes.**

   **Database:** **No changes.**

6. `feat: make workflow maps accessible and responsive`

   **Frontend:** Finish keyboard and ordered-list equivalents, mobile layout, focus
   restoration, both themes, and pending/error/empty states. Verify the complete first
   graph and existing assignment journeys in Playwright, and document the feature.

   **Backend:** Extend isolated restart verification to cover edited graph definitions,
   positions, applicability, and revisions; API behavior is unchanged in this commit.

   **Database:** **No changes.**

Review the first delivered DAG and adjust it before proceeding to another workflow.
Each commit includes checks appropriate to its behavior; verification is not deferred
entirely to commit 6.

## Graph and API contract

Use the existing Django/SQLite stack. Add `graph`, `graph_revision`, and
`graph_updated_at` to `WorkflowDefinition`; do not introduce task-run state into this
model. The graph document contains:

| Element | Proposed fields and meaning |
| --- | --- |
| Document | `schema_version`, `entry_node_id`, `nodes`, `edges` |
| Node | Stable `id`, `title`, `description`, `requirements`, `outputs`, `iteration_note`, `position` |
| Requirement | Stable `id`, `description`, `kind` (`requirement`, `validation`, or `approval`), `applicability` (`always` or `when_relevant`), optional applicability explanation |
| Edge | Stable `id`, `source`, `target`, descriptive `condition` |

An approval requirement produces the human-approval badge. Requirements describe
conditions before leaving the node. Outputs describe its handoff. Conditions and
applicability are descriptive text, not executable expressions or agent instructions.
Number cards using a deterministic topological ordering, with document order as the
tie-breaker; IDs remain stable when labels, positions, or display numbers change.

For mapped workflows, derive compatibility lists from the graph: topologically ordered
node descriptions for `steps`, deduplicated node outputs for `outputs`, validation-kind
requirements for `validation`, and approval-kind requirements for `approval_points`.
Include applicability text in these projections. Existing persisted lists serve only
unmapped workflows and provide the pre-mapping fallback; the new editor does not write
both representations. Graph summaries in the new tab come from the same document.

Proposed endpoints:

- Existing `GET /api/v1/workflows/` adds `has_graph`; retain its existing fields.
- `GET /api/v1/workflows/<key>/graph/` returns workflow metadata, graph (or `null`),
  revision, and update timestamp. A missing workflow returns 404; an unmapped existing
  workflow is a normal response.
- `PATCH /api/v1/workflows/<key>/graph/` accepts `{graph, revision}` for an authored
  graph and returns the saved representation and incremented revision. Unknown fields
  and invalid documents return 400 with stable field/node/edge paths; stale writes
  return 409. Repeat saves from the old revision cannot overwrite the first result.

Reuse the project's CSRF and request helpers and its revision-checked assignment
pattern. Compare the expected revision and update in one database operation inside
the save transaction; a read followed by an unconditional write is insufficient.
Creating the first map for another built-in remains a reviewed catalogue migration.

Validate schemas, types, bounded document/text sizes, unique IDs, nonempty node
descriptions and requirement descriptions, known endpoints, and finite positions.
Reject duplicate connections, self-loops, cycles, disconnected nodes, multiple entry
nodes, and nodes unreachable from the declared entry. Require at least one terminal
and a path from every node to a terminal; terminal nodes still describe completion
requirements. Validate on the server even if the canvas already rejected the edit.

Support forward forks and joins when a reviewed workflow needs them, with explicit
conditions and descriptions of whether preceding work is alternative or cumulative.
For iterative practices such as TDD or rework, use a node's iteration note or a
bounded iteration phase; never draw a backward edge and call it a DAG. Adding live
branch evaluation, retry execution, or task-specific evidence is outside this change.

Use `@xyflow/react` for custom nodes, selection, connections, and viewport controls;
use Dagre for an initial layout of the small flat DAGs. Keep domain JSON independent
of React Flow internals, preserve saved positions, and run auto-layout only initially
or on an explicit **Arrange** action. Pin compatible package versions and update
`frontend/package-lock.json` during implementation; do not assume a version from
this plan. The initial seed needs only a linear layout.

Likely files: `backend/workflows/{models,serializers,views,urls}.py`, a graph contract
and validator module, new migrations and workflow tests; `frontend/src/features/
workflows/WorkflowsPage.tsx`, `api.ts`, `workflows.css`, and new map/node/inspector/editor
components; `frontend/tests/e2e/workflows.spec.ts`, `README.md`, and the architecture
and engineering-practices documentation. Task worker and adapter files need no edits.

## First DAG: Plan and execute

Use the consolidated definition in migration `0003_consolidate_workflows`, including
documentation checks. The following is proposed requirement copy for review, rather
than an automatic inference that existing workflow-wide checks belong to a given node.

| Node | Description and requirements before continuing | Handoff / next edge |
| --- | --- | --- |
| Define scope | Agree scope and acceptance criteria; identify the audience for documentation when relevant; obtain approval of the brief plan. | Scope and acceptance checklist; **Plan approved** → Implement |
| Implement | Implement the agreed change or draft documentation; keep the result within the accepted scope and ready for validation. | Implemented change or draft; **Change ready** → Validate |
| Validate | Pass checks appropriate to affected behavior and environment and record evidence; when relevant verify documentation accuracy, examples, commands, links, and builds. | Change and validation evidence; **Checks passed** → Review and accept |
| Review and accept | Review against the agreed criteria, including accuracy and clarity; obtain human acceptance through the repository process. | Reviewed and accepted result; terminal |

The four cards are workflow practices, not replacements for the existing Kanban
columns. Keep both approval points even though the first graph is otherwise linear.
The screenshot cards show abbreviated requirements; the inspector supplies full copy.

## Subsequent proposed commits: one reviewed DAG each

Only begin the next item after reviewing and, if needed, editing the previous map.
Each item depends on the shared implementation and uses its own frozen seed migration
and meaning-focused catalogue test. None needs task execution integration.

7. `feat: map the spec-driven workflow`

   **Frontend:** **No changes.**

   **Backend:** Define specification, interface-contract applicability, open questions,
   implementation slices, validation, and acceptance requirements for this DAG.

   **Database:** Seed only `spec-driven`; preserve saved assignments and existing maps.

8. `feat: map the test-driven workflow`

   **Frontend:** **No changes.**

   **Backend:** Define behavior agreement, failing-test evidence, passing implementation,
   refactoring, and acceptance, with an explicit iteration note rather than a cycle.

   **Database:** Seed only `test-driven`; preserve saved assignments and existing maps.

9. `feat: map the diagnosis and regression workflow`

   **Frontend:** **No changes.**

   **Backend:** Define reproduction, diagnosis review, regression failure evidence,
   scoped repair, and verified acceptance requirements.

   **Database:** Seed only `diagnose-regression`; preserve saved assignments and existing maps.

10. `feat: map the behavior-preserving refactoring workflow`

    **Frontend:** **No changes.**

    **Backend:** Define baseline evidence, coverage boundaries, structural changes,
    compatibility checks, and acceptance requirements.

    **Database:** Seed only `behavior-preserving-refactor`; preserve saved assignments and existing maps.

11. `feat: map the design and validation workflow`

    **Frontend:** **No changes.**

    **Backend:** Define journey, prototype applicability, design approval,
    implementation, and interaction/accessibility validation requirements.

    **Database:** Seed only `design-validate`; preserve saved assignments and existing maps.

12. `feat: map the accessibility remediation workflow`

    **Frontend:** **No changes.**

    **Backend:** Define standards and barrier assessment, targeted fixes, automated
    and human evaluation, remaining-barrier review, and acceptance requirements.

    **Database:** Seed only `accessibility-remediation`; preserve saved assignments and existing maps.

13. `feat: map the staged migration workflow`

    **Frontend:** **No changes.**

    **Backend:** Define compatibility and recovery planning, rehearsal, conditional
    expansion/backfill, verified switchover, and approval before destructive retirement.

    **Database:** Seed only `staged-migration`; preserve saved assignments and existing maps.

14. `feat: map the measurement and optimization workflow`

    **Frontend:** **No changes.**

    **Backend:** Define measurable targets, representative baselines, profiling,
    optimization, comparable measurements, correctness, and acceptance requirements.

    **Database:** Seed only `measure-optimize`; preserve saved assignments and existing maps.

15. `feat: map the security-focused workflow`

    **Frontend:** **No changes.**

    **Backend:** Define assessment, requirements, mitigation approval, abuse-case
    verification, and acceptance of documented remaining risk.

    **Database:** Seed only `security-focused`; preserve saved assignments and existing maps.

16. `feat: map the compatibility upgrade workflow`

    **Frontend:** **No changes.**

    **Backend:** Define breaking-change assessment, baseline, manageable upgrades,
    compatibility and regression evidence, and acceptance requirements.

    **Database:** Seed only `compatibility-upgrade`; preserve saved assignments and existing maps.

17. `feat: map the controlled operational change workflow`

    **Frontend:** **No changes.**

    **Backend:** Define impact assessment, authorization, rollout/recovery planning,
    environment validation, observation, and explicit continue-or-recover outcomes.

    **Database:** Seed only `controlled-operational-change`; preserve saved assignments and existing maps.

18. `feat: map the risk-based testing workflow`

    **Frontend:** **No changes.**

    **Backend:** Define uncovered behavior, agreed risk priorities, test boundaries,
    meaningful failure detection, reliability, and acceptance requirements.

    **Database:** Seed only `risk-based-testing`; preserve saved assignments and existing maps.

19. `feat: map the discovery and design review workflow`

    **Frontend:** **No changes.**

    **Backend:** Define the question/timebox, evidence, alternatives, architecture
    applicability, and reviewed proceed/clarify/stop outcomes as forward branches.

    **Database:** Seed only `timeboxed-discovery`; preserve saved assignments and existing maps.

20. `feat: map the incident response workflow`

    **Frontend:** **No changes.**

    **Backend:** Define impact assessment, containment, recovery verification,
    communication, and separate follow-up requirements from the existing incident definition.

    **Database:** Seed only `incident-response`; preserve saved assignments and existing maps.

Future migrations must only populate an unmapped workflow. Never overwrite a user's
saved graph while adding another graph or updating catalogue defaults. Corrections to
an already mapped definition need an explicit edit or an individually reviewed upgrade
strategy; data-migration rollback must also avoid deleting a graph edited since seeding.

## Verification and acceptance

- Backend: accept linear and fork/join examples; reject malformed documents, loops,
  unknown endpoints, duplicate IDs/connections, disconnected nodes, and invalid
  entry/terminal structure. Exercise CSRF, atomic stale-write rejection, and 404s.
- Migration: fresh install and upgrade from the existing catalogue retain all 19
  assignments; initially exactly one graph is mapped. Existing edits survive a later
  seed migration, and the API's legacy projections reflect graph edits consistently.
- Browser: switch tabs and workflows, select nodes by keyboard, inspect full requirements,
  add/edit/remove a node or transition, reject a cycle, save and refresh, cancel,
  retain a draft after network errors, and reconcile two-tab conflicts. Confirm browser
  Back/Forward and unsaved-navigation behavior.
- Persistence: save a graph, restart an isolated backend, and read the same graph,
  positions, requirement applicability, and revision. Do not use the user's normal data.
- Visual/accessibility: inspect desktop and 390px/320px widths, 200% text zoom,
  light/dark themes, ordered-view parity, visible focus, and reduced motion; keep graph
  panning inside the canvas and all forms reachable without page overflow.
- Regression: run `python scripts/check.py`, targeted workflow Playwright tests, then
  the full Chromium suite once the shared viewer/editor is complete. Verify existing
  assignments and task approval behavior; use deterministic agent fixtures.

The first delivery is accepted when the Plan and execute DAG is understandable,
editable, persistent, cycle-free, and accessible, and the other 14 workflows remain
clearly marked as awaiting an authored map. Complete each later graph using the same
review and validation process.

## Generated concept screenshots

These images were generated with the built-in image generation tool. They illustrate
the proposed feature and are not screenshots of implemented application behavior.

1. [Overview](../designs/workflow-dag/01-overview.png): one graph, arrow labels,
   node requirements, expected outputs, and human approval points.
2. [Node requirements](../designs/workflow-dag/02-node-requirements.png): selected
   Validate node and its full requirements, applicability, output, and next transition.
3. [Edit workflow](../designs/workflow-dag/03-edit-workflow.png): one draft, inline
   requirement/transition forms, and explicit Save/Cancel.

[Prompt set and generation notes](../designs/workflow-dag/generation-notes.md).
[Interactive screenshot gallery](../designs/workflow-dag/gallery.html).

## Primary implementation references

- [React Flow custom nodes](https://reactflow.dev/learn/customization/custom-nodes)
- [React Flow layout options and Dagre](https://reactflow.dev/learn/layouting/layouting)
- [React Flow connection validation](https://reactflow.dev/examples/interaction/validation)
- [React Flow cycle prevention](https://reactflow.dev/examples/interaction/prevent-cycles)
- [React Flow accessibility](https://reactflow.dev/learn/advanced-use/accessibility)

Consulted November 26, 2026. React Flow supplies graph UI primitives; server validation,
requirements semantics, persistence, and revision conflict handling remain application code.

## First delivery: implemented and verified

The first six commits are implemented. Plan and execute is the only authored DAG;
the remaining 14 definitions retain their assignments and unmapped state for the
individual review sequence above. The map supports node requirements and applicability,
human approvals, outputs, transitions, graph/list views, one editable draft, saved
positions, validation, revision conflicts, and unsaved-navigation protection.

Verified locally on November 26, 2026:

- `python scripts/check.py` passed: all 319 backend tests, Python/frontend lint and
  formatting, Django system/migration checks, TypeScript, and the production build.
  The default machine pytest temp directory was unreadable, so the successful run
  used `PYTEST_ADDOPTS` with a fresh isolated base directory. Existing permissions
  were not changed.
- The full Chromium run passed 100 of 101 cases, including all 12 DAG scenarios.
  The existing Backlog refinement case raced the board's revision poll; its test now
  waits for the completed task snapshot before sending answers, and passed its
  focused rerun. Task execution and approval application code was not changed.
- `python scripts/check_persistence.py` passed across a real backend restart,
  preserving graph edits, positions, conditional applicability, revisions, tasks,
  projects, and assignments in an isolated database.
- Browser checks cover saved edits, adding/removing nodes, connection repair, cycle
  prevention, network failures, two-tab conflict comparison, pending saves, URL/history
  state, unsaved-navigation guards, keyboard movement, and focus restoration.
- Desktop graph/inspector/editor screenshots were inspected. Both themes and 320px/
  390px layouts passed overflow checks at 100% and 200% text size; ordered steps is
  the initial mobile view. The canvas refits when the inspector changes its width.

The build succeeds with a dependency bundler warning about the `use no memo`
directive in `react-compiler-runtime`, brought in by React Flow. The graph behavior
passes the browser checks. Package versions are pinned to `@xyflow/react` 13.0.3
and `@dagrejs/dagre` 3.1.4.
