# Delete backlog tasks

Status: Implemented and verified locally. All 15 API tests and 6 browser tests pass, along with static, migration, and production-build checks. Localhost was restarted to load the delete endpoint.

## Commit 1: `feat: allow deleting backlog tasks`

- **Frontend:** Add a Delete action to each task, confirm before removal, and show pending or failure states. Remove the card only after the API succeeds, and verify cancellation, persistence after reload, and failure recovery in the browser.
- **Backend:** Add a UUID-addressed DELETE endpoint with the same explicit anonymous CSRF protection as task creation. Test successful deletion, missing tasks, and rejected unverified requests.
- **Database:** Delete the selected task from persistent SQLite storage while preserving other tasks. No schema changes or migrations are required.

## Acceptance criteria

- Every backlog task can be deleted after confirmation; canceling keeps the task.
- A successful deletion remains effective after reloading the app.
- A failed deletion keeps the task visible and shows a useful message with the ability to retry.
- Unverified delete requests cannot remove stored tasks.
- The existing task creation and listing checks continue to pass.
- Refresh the running local backend after implementation so the localhost app includes the endpoint.
- Commit locally only; the user handles any pushing or PR creation.
