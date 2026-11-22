# Scaffold local app with SQLite-backed backlog

A fresh checkout can be installed and started as a local React/Django application with Backlog, Plan, Integrate, Test, and Final Approval columns. Developers create tasks in a popup opened from Backlog, delete tasks with confirmation, see useful validation or connection errors, and retrieve their tasks after a page reload or backend restart. Failed creation retains the popup and draft; failed deletion preserves the card with a retry action.

The backend owns task status and persists records through Django migrations to a configurable, ignored SQLite database. Anonymous local writes use explicit CSRF protection. A shared launcher starts both services and stops their process trees together.

## Validation performed locally on Windows

- 15 API tests covering creation, listing, deletion, validation, backend-owned status, CSRF, and cross-request persistence.
- 7 Chromium checks covering the five-stage board, popup creation/reload, Cancel/Escape/close and focus restoration, failed creation, connection recovery, a narrow-screen layout, deletion confirmation/cancellation, persistent deletion, and deletion failure/retry.
- A real backend restart against an isolated SQLite database retained the saved task.
- The shared launcher started and stopped both services in a Windows console.
- Python lint/format, Django system and migration checks, frontend lint/format, TypeScript checks, and the production build passed.
- Desktop and mobile browser screenshots were inspected.

A GitHub Actions workflow is configured for Windows and Linux. Hosted CI has not run; the user handles pushing and opening the PR after local review.

## Scope

This foundation includes task creation/deletion and a backlog view. Agent execution, approval gates, decision history, drag-and-drop transitions, and desktop packaging follow in subsequent changes.

See the root README for setup and verification commands, `docs/architecture.md` for boundaries, and `docs/plans/001-app-foundation.md` for the commit plan.
