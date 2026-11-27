# Native GitHub App authorization

Status: Implemented and verified locally on Windows. Live authorization awaits the publisher's one-time GitHub App registration and public Client ID; see [setup](../github-app.md).

Base: `2c0700f`. Builds on the two GitHub Connections commits already on this branch. No additional prerequisite commits outside this change. Commit locally between chunks; do not push.

## Commit 1: `feat: add native GitHub OAuth and secure credential storage`

- **Frontend:** No changes.
- **Backend:** Add direct HTTPS device authorization, account lookup, token refresh, and OS credential storage with protocol tests. Pin the credential-store dependency and add the publisher's public GitHub App Client ID setting.
- **Database:** No changes.

## Commit 2: `feat: connect GitHub accounts without GitHub CLI`

- **Frontend:** Replace CLI availability with app readiness, retain the browser handoff, and display GitHub-provided code expiry. Earlier connections clearly require authorization for the new app.
- **Backend:** Replace CLI processes with native device authorization, server-enforced polling intervals/backoff, cancellation, expiry, verified account persistence, and secure credential deletion.
- **Database:** Add the authorizing GitHub App Client ID to connection metadata, identifying earlier connections that require fresh consent. Tokens remain exclusively in the system credential store.

## Commit 3: `feat: refresh and verify saved GitHub connections`

- **Frontend:** Verify saved connections on opening Settings and support recovery from expired, revoked, or temporarily unavailable authorization.
- **Backend:** Refresh expiring tokens, rotate stored refresh tokens, verify that credentials still belong to the selected account, and expose a CSRF-protected verification endpoint.
- **Database:** No changes.

## Commit 4: `refactor: remove obsolete GitHub CLI connection code`

- **Frontend:** Remove obsolete CLI messages and test terminology.
- **Backend:** Remove unused CLI fixtures and compatibility code; update current setup/architecture documentation and clearly archive the earlier CLI plan. Preserve shared process utilities still used by coding agents.
- **Database:** Rename the old configuration identifier to describe the native credential-store reference. Retain the historical initial migration for existing installations.

## Acceptance and validation

- No GitHub CLI executable, environment token, app client secret, or private key is required for the new connection flow.
- The publisher registers one GitHub App, enables device flow, and supplies its public Client ID through `TORCHBEARER_GITHUB_CLIENT_ID`. End users only authorize the application. Registration is not yet available in this session; document it without substituting another application's ID.
- Fail closed when a secure Windows Credential Manager, macOS Keychain, or Linux Secret Service store is unavailable; do not fall back to plaintext token files or SQLite.
- Validate GitHub's device-code fields and fixed verification URL, honor `interval`, `slow_down`, rate-limit backoff and code expiry, and retain the previous account until replacement credentials are verified and stored.
- Cancellation, expiry, disconnect, and account replacement prevent late network results from restoring a connection. App changes or missing/revoked credentials require reauthorization.
- Refresh expiring credentials without exposing secrets; verify the authenticated numeric account ID before using refreshed credentials.
- Use mocked HTTP and an in-memory credential store in automated tests. Never read or modify the developer's real credential store or perform a live OAuth grant during validation.
- Run focused checks before each local commit, then full portable checks and Chromium regression coverage before the cleanup commit. Record actual results below.

## Verification by chunk

- Commit 1 (`4ac31fb`): all 46 connection tests pass, including 29 new OAuth/credential cases. Python lint/format, Django system checks, dependency consistency, and this worktree's required setup script pass.
- Commit 2 (`f2cadb3`): all 49 connection tests and nine Chromium Connections tests pass. Django system/migration checks, Python lint/format, frontend lint, TypeScript, production build, and whitespace checks pass. Tests use mocked GitHub and an in-memory vault, with no CLI or real credential access.
- Commit 3 (`3653f15`): all 67 connection tests and 11 Chromium Connections tests pass. Coverage includes refresh rotation, restored service state, expired/revoked/missing/corrupt credentials, numeric account identity, concurrent refresh, temporary outages after rotation, and disconnect during network/storage operations. Static, migration, frontend lint/type/build, and whitespace checks pass.
- Final cleanup: all 69 connection tests pass, including upgrades from the original schema and the intermediate native schema. Both preserve account identity and UUIDs; native credentials remain usable after the field rename.
- `python scripts/check.py` passes with 234 backend tests, Python lint/format, Django system/migration checks, frontend formatting/lint, TypeScript, and the production build. The full Chromium suite passes all 74 tests, including 11 Connections cases and the existing workflows, projects, navigation, and styling regressions.
- `python scripts/check_persistence.py` passes for task/project restart persistence. Desktop and 320px native-authorization screenshots were visually inspected.
- The cleanup audit finds no CLI command resolution, subprocess ownership, terminal-output parsing, or obsolete CLI fixture in the connection implementation. Shared process utilities remain in use by coding-agent adapters. Historical migrations and the archived earlier plan are retained for upgrades and review.
- All authorization tests use simulated GitHub responses and an in-memory keychain. No live OAuth grant or developer credentials were used. Hosted/Linux checks have not been run in this Windows session.
