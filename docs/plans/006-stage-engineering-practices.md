# Stage engineering practices

Use Backlog, Plan, Integrate, Code Review, and Final Approval. Integrate owns implementation
and automated validation; Code Review independently assesses the approved specification,
engineering standards, and the implementation's validation evidence. Humans retain every
transition and final approval. Practices are adapted from Matt Pocock's skills to preserve
Torchbearer's read-only stages, local worktrees, and normalized result contract.

## Proposed commits

No prerequisite commits outside this change.

1. `feat: consolidate validation into implementation`

   **Frontend:** Remove Test from the board, routing, and progression controls while retaining
   historical Test reports. Integrate approval starts Code Review.

   **Backend:** Require passing validation commands to complete Integrate and bind review
   evidence to the approved implementation snapshot. Rework returns through Integrate and review.

   **Database:** Move unfinished legacy Test and downstream tasks back to Integrate, invalidate
   obsolete queued attempts, and retain completed tasks and all historical evidence.

2. `feat: embed engineering disciplines in agent stages`

   **Frontend:** Describe each column's responsibility and expose implementation validation
   alongside review and final approval.

   **Backend:** Embed specification, domain modeling, module design, TDD, diagnosis, two-axis
   review, and concise handoff practices in stage prompts, with source attribution.

   **Database:** No changes.

3. `feat: add optional task refinement and retrospectives`

   **Frontend:** Offer user-started Backlog refinement and post-approval retrospectives with
   retained feedback and history, without new columns.

   **Backend:** Run both actions read-only, carry refinement decisions into Plan, and retain
   retrospective suggestions without changing accepted code or automatically starting follow-ups.

   **Database:** Add refinement and retrospective run choices while retaining legacy run types.

## Verification

Exercise migration from existing workflows, validation failures and stale evidence, all agent
routing approaches, review rework, refinement feedback, retrospective isolation, cancellation,
and read-only enforcement. Run the repository checks and Chromium integration checks against
isolated databases and deterministic fake agent CLIs.
