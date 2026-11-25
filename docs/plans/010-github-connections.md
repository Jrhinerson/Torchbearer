# GitHub Connections in Settings

Status: Implemented and verified locally on Windows.

Base: local HEAD. No prerequisite commits outside this change. Commit locally only.

## Commit 1: `feat: add GitHub browser authorization service`

- **Frontend:** No changes.
- **Backend:** Add a GitHub CLI device authorization service and CSRF-protected connect, poll, cancel, and disconnect endpoints. Isolate CLI configuration under the local data directory, validate the authorized account through GitHub, and bound and clean up pending login processes.
- **Database:** Add a singleton GitHub connection containing the verified account identity, connection date, and the identifier of its CLI configuration. Tokens remain managed by GitHub CLI and are never returned to the browser or stored in SQLite.

## Commit 2: `feat: add GitHub Connections to Settings`

- **Frontend:** Replace the Settings placeholder with Connections and a GitHub account card. Open GitHub authorization in a new tab, display the one-time code, resume pending authorization on reload, and support retry, cancellation, account changes, and disconnect with accessible loading/error states.
- **Backend:** No changes.
- **Database:** No changes.

## Acceptance and validation

- Connecting explicitly starts GitHub's browser device flow rather than silently adopting an existing account or an environment token.
- GitHub CLI must be installed on the backend machine; missing installations have an actionable message.
- Complete login only after `gh api user` verifies the newly authorized account. Failed or cancelled account changes retain the previous connection.
- Persist account identity across frontend/backend restarts; keep secrets out of API responses, logs, and SQLite.
- Use a separate CLI configuration for each attempt. Disconnect removes Torchbearer's connection/configuration without logging other applications out of shared system credential storage.
- Time out unfinished logins after 15 minutes, stop their process trees, ignore stale polls, and prevent late completion after cancellation/disconnect.
- Verify backend API/process behavior with a deterministic fake CLI, frontend static/build checks, and Chromium coverage for authorization handoff, connection persistence, failures, cancellation, and narrow layouts. No live GitHub login or developer credentials are used in tests.

The service targets the existing local single-process Django deployment. Pending login processes end with that backend; a server restart requires starting authorization again. Successfully connected accounts persist.

## Verification

- `python scripts/setup.py` created this worktree's own environment, installed pinned dependencies, and applied migrations. The new connection migration also applies cleanly to fresh databases.
- `python scripts/check.py` passes: 182 backend tests (including 17 connection cases), Python lint/format, Django system/migration checks, frontend formatting/lint, TypeScript, and the production build.
- All 71 Chromium integration tests pass, including eight new Connections tests. Coverage includes browser tab navigation and opener isolation, copying the code, verified-account display, reload, cancellation, failure recovery, blocked popups, missing CLI, and an interrupted backend login.
- Backend tests launch a deterministic CLI process to verify configuration isolation, inherited-token removal, account verification, expiry, cancellation, safe account replacement, and disconnect. Cancellation/disconnect during in-flight identity verification cannot save a late connection.
- Screenshots were visually inspected for desktop authorization, 320px reflow, and 200% text sizing at desktop width. Existing workflow, project, navigation, and styling checks remain green.
- `python scripts/check_persistence.py` passes for existing task/project restart persistence. Connection API tests separately verify durable account identity with a fresh service instance.
- Tests use simulated GitHub responses and a fake CLI; no live OAuth grant or developer credentials were used. Linux/hosted CI has not been run as part of this local verification.
