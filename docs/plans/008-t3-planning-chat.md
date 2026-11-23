# Planning chat layout

Reference: the installed T3 Code chat window. Use a compact task header, a full-height
scrolling thread, rounded human messages, flat assistant responses with Markdown, and a
rounded bottom composer with the selected agent and accessible send/stop icons. Preserve
the existing saved conversation and explicit plan approval.

No prerequisite commits are needed.

1. `style: align planning chat with T3 Code`
   - **Frontend:** Restructure the Plan dialog around the thread and anchored composer; render
     Markdown replies and keep long code/tables within the message column. Preserve keyboard
     submission, failed drafts, stop/retry, and approval, with responsive and theme checks.
   - **Backend:** **No changes.**
   - **Database:** **No changes.**

Verification covers long replies, composer expansion, independent thread scrolling,
safe Markdown, keyboard focus, desktop/mobile layout, conversation persistence, error
recovery, cancellation, and approval freshness. Existing backend behavior is unchanged.

Verified locally: frontend build, lint, formatting, and 16 targeted Chromium browser checks
passed. Layout checks cover dark/light themes at 1,280px, 390px, and 320px, including live
window resizing and Markdown containment. Conversation checks use deterministic agents and
disposable data. One existing board focus assertion failed once and passed on rerun without
changes to the board or its test. No backend code or database migration changed.
