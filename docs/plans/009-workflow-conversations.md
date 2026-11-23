# Conversations throughout the workflow

Extend the approved T3 Code style interface from Plan to Integrate, Test, Code Review,
and Final Approval. Keep Backlog creation/settings and board cards unchanged. Continue
the task's chronological conversation as it moves through stages, with Markdown results,
test evidence, execution logs, workspace changes, and human decision history.

No prerequisite commits are needed.

1. `feat: use conversation view throughout task workflow`
   - **Frontend:** Share the conversation layout across every started-task stage, with an
     anchored composer for planning messages, revisions, or explicit send-back requests.
     Keep stage approvals separate and completed tasks read-only.
   - **Backend:** **No changes.** Existing planning, revise, send-back, retry, cancellation,
     and approval actions enforce the workflow and stage permissions.
   - **Database:** **No changes.** Existing run feedback, reports, and decisions supply
     the conversation and survive refreshes.

Verify the complete routing/approval workflow, same-stage revisions, send-back actions,
failure recovery, cancellation, stale approval checks, final approval, and persistence.
Check all stages at desktop and narrow widths, keeping long reports and evidence inside
the scrollable thread and the composer/approval controls reachable.

Verified locally: build, lint, formatting, and all 60 Chromium browser cases. The full
run passed 58 cases; two existing Plan checks matched stage labels in the new thread as
well as the board column. After scoping those selectors to board columns, both passed
on targeted rerun. Coverage includes all routing policies through final approval,
stage revisions, final-review rework, returning to Plan, refresh persistence, and
desktop/mobile layouts. Agent execution uses deterministic fixtures and disposable data.
