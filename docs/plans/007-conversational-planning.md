# Conversational planning

Replace the one-shot Plan review with a saved conversation. The human can answer questions,
discuss alternatives, and refine the plan before explicitly approving implementation. Remove
the workspace metadata and Run history selector only from Plan; retain the board and later
stage review controls.

No additional prerequisite commits are needed.

1. `feat: support conversational planning turns`
   - **Frontend:** Add the typed action for sending a planning message.
   - **Backend:** Queue read-only planning replies without advancing the task, replay the full
     conversation, and require a self-contained final plan for the existing approval handoff.
   - **Database:** **No changes.** Existing run feedback, results, and decisions persist each turn.
2. `feat: present planning as a chat conversation`
   - **Frontend:** Show a chronological conversation and keyboard-accessible composer with pending,
     failure, retry, and stop states. Keep explicit plan approval separate from messaging.
   - **Backend:** **No changes.**
   - **Database:** **No changes.**

Validation covers revision and stage guards, durable full conversation context, latest-plan
approval and implementation handoff, multi-turn browser interaction, refresh persistence,
failed submissions, cancellation, and narrow-screen layout. Existing later-stage workflow
checks continue to exercise review and approval through completion.

Verified locally: 150 backend tests and 42 Chromium browser tests passed, including
conversation persistence and refinement at 1,280px and 390px. Frontend build, lint,
formatting, Python lint/formatting, Django system checks, and migration checks passed.
Browser checks use deterministic CLI fixtures and a disposable database; no real agent
was launched for verification. This change needs no database migration.
